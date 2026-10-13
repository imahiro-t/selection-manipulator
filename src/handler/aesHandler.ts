import {
  window,
  TextEditor,
} from 'vscode';
import { InfoCommandNotifier } from './commandCommon';
import { applyEdit, ensureEditorAfterInput } from '../editGuard';
import * as crypto from 'crypto';
import { openTextDocument } from '../common';

type Command = 'encrypt' | 'decrypt';

/** Where the AES commands send their messages (the compatibility-mode notice and the edit guard warnings). */
export type AesNotifier = Pick<InfoCommandNotifier, 'showInformationMessage' | 'showWarningMessage'>;

export interface AesDependencies {
  notifier: AesNotifier;
  /**
   * Test-only hook, passed on to `ensureEditorAfterInput` (see `EditGuardDeps.isEditorAvailable`).
   * Production callers never pass it, so the default check of `src/editGuard.ts` is used.
   */
  isEditorAvailable?: (textEditor: TextEditor) => boolean;
}

export const defaultAesDependencies: AesDependencies = { notifier: window };

/**
 * The returned command resolves when the command is done (for the non-Replace commands, after the
 * result document is shown) and rejects with the original error when the command fails.
 */
export const aesHandler: (command: Command, isReplace: boolean, testSecret?: string, deps?: AesDependencies) => (textEditor: TextEditor) => Promise<void> = (command, isReplace, testSecret, deps = defaultAesDependencies) => async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const secret = testSecret ?? (await window.showInputBox({
    prompt: 'Secret?',
    ignoreFocusOut: true,
    password: true,
  }) ?? "");
  if (!ensureEditorAfterInput(textEditor, { notifier: deps.notifier, isEditorAvailable: deps.isEditorAvailable })) {
    return;
  }
  const converter = createConverter(command, secret, deps.notifier);
  if (isReplace) {
    if (textEditor.selections.length === 0) {
      return;
    }
    const applied = await applyEdit(textEditor, (editBuilder) => {
      textEditor.selections
        .forEach(selection => {
          const text = textEditor.document.getText(selection);
          editBuilder.replace(selection, converter.convert(text));
        });
    }, { notifier: deps.notifier });
    if (applied) {
      converter.notifyLegacy();
    }
  } else {
    const selectedText = textEditor.document.getText(textEditor.selection);
    if (!selectedText) {
      return;
    }
    await openTextDocument(converter.convert(selectedText));
    converter.notifyLegacy();
  }
};

/**
 * Converts each selection and remembers whether any of them was a legacy-format ciphertext, so the
 * compatibility-mode notice is shown at most once per command run (never with the text or secret).
 */
const createConverter = (command: Command, secret: string, notifier: AesNotifier) => {
  let usedLegacy = false;
  return {
    convert: (value: string): string => {
      switch (command) {
        case 'encrypt':
          return aesEncrypt(value, secret);
        case 'decrypt': {
          const result = aesDecrypt(value, secret);
          usedLegacy = usedLegacy || result.legacy;
          return result.text;
        }
        default:
          return '';
      }
    },
    notifyLegacy: (): void => {
      if (usedLegacy) {
        usedLegacy = false;
        void notifier.showInformationMessage(LEGACY_NOTICE);
      }
    },
  };
};

export const LEGACY_NOTICE = 'Decrypted text in a legacy AES format (compatibility mode: fixed salt). Encrypt it again to store it in the current v2 format with a random salt and IV.';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const V2_PREFIX = 'v2';
/** Salt of the legacy formats. Compatibility mode only; never used to encrypt. */
const LEGACY_SALT = 'salt';
const HEX_16_BYTES = /^[0-9a-f]{32}$/i;
const HEX = /^(?:[0-9a-f]{2})+$/i;

/**
 * Encrypts `src` in the v2 format `v2:<salt hex>:<iv hex>:<ciphertext hex>` (AES-256-CBC, key
 * derived with scrypt from the secret and a random 16-byte salt, random 16-byte IV).
 */
export const aesEncrypt = (src: string, secret: string): string => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.scryptSync(secret, salt, KEY_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = cipher.update(src, 'utf8', 'hex') + cipher.final('hex');
  return `${V2_PREFIX}:${salt.toString('hex')}:${iv.toString('hex')}:${encrypted}`;
};

/**
 * Decrypts the v2 format, or one of the two legacy formats in compatibility mode:
 * - legacy A: `<iv hex>:<ciphertext hex>` with the fixed salt `'salt'`
 * - legacy B: `<ciphertext hex>` with the fixed salt `'salt'` and a zero IV
 * Returns an empty text when the input matches no format or cannot be decrypted. `legacy` tells
 * whether compatibility mode was used.
 */
export const aesDecrypt = (encrypted: string, secret: string): { text: string; legacy: boolean } => {
  // Ciphertexts never contain whitespace; tolerate a selection that includes surrounding blanks.
  const parts = encrypted.trim().split(':');
  try {
    if (parts.length === 4 && parts[0] === V2_PREFIX) {
      const [, salt, iv, cipherText] = parts;
      if (!HEX_16_BYTES.test(salt) || !HEX_16_BYTES.test(iv) || !HEX.test(cipherText)) {
        return { text: '', legacy: false };
      }
      const key = crypto.scryptSync(secret, Buffer.from(salt, 'hex'), KEY_LENGTH);
      return { text: decipher(key, Buffer.from(iv, 'hex'), cipherText), legacy: false };
    }
    if (parts.length === 2 && HEX_16_BYTES.test(parts[0]) && HEX.test(parts[1])) {
      return { text: decryptLegacyWithIv(parts[0], parts[1], secret), legacy: true };
    }
    if (parts.length === 1 && HEX.test(parts[0])) {
      return { text: decryptLegacyZeroIv(parts[0], secret), legacy: true };
    }
  } catch (_e) {
    // Wrong secret or corrupted ciphertext (bad padding): fall through to the empty result.
  }
  return { text: '', legacy: false };
};

const decipher = (key: Buffer, iv: Buffer, cipherText: string): string => {
  const d = crypto.createDecipheriv(ALGORITHM, key, iv);
  return d.update(cipherText, 'hex', 'utf8') + d.final('utf8');
};

/** Compatibility mode (legacy A: fixed salt `'salt'`, stored IV). Never used for new encryption. */
const decryptLegacyWithIv = (ivHex: string, cipherText: string, secret: string): string => {
  const key = crypto.scryptSync(secret, LEGACY_SALT, KEY_LENGTH);
  return decipher(key, Buffer.from(ivHex, 'hex'), cipherText);
};

/** Compatibility mode (legacy B: fixed salt `'salt'`, zero IV). Never used for new encryption. */
const decryptLegacyZeroIv = (cipherText: string, secret: string): string => {
  const key = crypto.scryptSync(secret, LEGACY_SALT, KEY_LENGTH);
  return decipher(key, Buffer.alloc(IV_LENGTH, 0), cipherText);
};
