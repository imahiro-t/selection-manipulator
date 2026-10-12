import * as assert from 'assert';
import {
  SQL_BACKSLASH_REASON,
  SQL_CONTROL_CHARACTER,
  SQL_CONTROL_CHARACTER_REASON,
  SQL_YEN_SIGN_REASON,
  sqlUnsafeCharacterReason,
} from '../../handler/sqlSafety';

const hex = (code: number): string => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;

/** U+0000..U+0008, U+000B, U+000C, U+000E..U+001F and U+007F: the 30 refused control characters. */
const REFUSED_CONTROLS = [
  ...Array.from({ length: 0x20 }, (_, code) => code).filter((code) => code !== 0x09 && code !== 0x0a && code !== 0x0d),
  0x7f,
];

suite('sqlSafety', () => {
  test('a backslash or a yen sign (U+00A5) is unsafe; a backslash is reported first', () => {
    assert.strictEqual(sqlUnsafeCharacterReason('C:\\Users'), SQL_BACKSLASH_REASON);
    assert.strictEqual(sqlUnsafeCharacterReason('\u00A5\' OR 1=1 --'), SQL_YEN_SIGN_REASON);
    assert.strictEqual(sqlUnsafeCharacterReason('\u00A5\\'), SQL_BACKSLASH_REASON);
    assert.strictEqual(
      SQL_BACKSLASH_REASON,
      "a backslash (\\), which is not safe in MySQL's default mode (the SQL is written as standard SQL)"
    );
    assert.strictEqual(
      SQL_YEN_SIGN_REASON,
      "a yen sign (\u00A5), which is saved as a backslash in Shift_JIS, CP932 and EUC-JP and is not safe in MySQL's default mode (the SQL is written as standard SQL)"
    );
  });

  test('other text is safe, including single quotes and look-alikes of the yen sign', () => {
    // U+FFE5 (fullwidth yen) is 0x818F in Shift_JIS, not 0x5C; U+FF3C (fullwidth backslash) is 0x815F.
    for (const text of ['', "O'Neil", "'; DROP TABLE t; --", '\uFFE5100', '\uFF3C', '円']) {
      assert.strictEqual(sqlUnsafeCharacterReason(text), undefined, text);
    }
  });

  test('every control character other than tab, CR and LF (NUL and DEL included) is unsafe', () => {
    assert.strictEqual(SQL_CONTROL_CHARACTER_REASON, 'a control character');
    assert.strictEqual(REFUSED_CONTROLS.length, 30);
    for (const code of REFUSED_CONTROLS) {
      const character = String.fromCharCode(code);
      for (const text of [character, `a${character}b`, `O'Neil${character}`, `x\n${character}\ny`]) {
        assert.strictEqual(sqlUnsafeCharacterReason(text), SQL_CONTROL_CHARACTER_REASON, `${hex(code)} in ${JSON.stringify(text)}`);
      }
    }
    // The regular expression keeps no state between calls (no `g` flag).
    assert.strictEqual(SQL_CONTROL_CHARACTER.flags, '');
  });

  test('tab, CR, LF and characters outside C0 / DEL (C1 controls, U+0085, U+2028) are not refused', () => {
    for (const text of ['\t', '\n', '\r', 'a\tb\r\nc\n', ' ', '\u0080', '\u0085', '\u009f', '\u2028', '\u200b']) {
      assert.strictEqual(sqlUnsafeCharacterReason(text), undefined, JSON.stringify(text));
    }
  });

  test('a control character is reported before a backslash or a yen sign', () => {
    assert.strictEqual(sqlUnsafeCharacterReason('\\\u0000'), SQL_CONTROL_CHARACTER_REASON);
    assert.strictEqual(sqlUnsafeCharacterReason('\u00A5\u007f'), SQL_CONTROL_CHARACTER_REASON);
    assert.strictEqual(sqlUnsafeCharacterReason('\u001b\\\u00A5'), SQL_CONTROL_CHARACTER_REASON);
  });
});
