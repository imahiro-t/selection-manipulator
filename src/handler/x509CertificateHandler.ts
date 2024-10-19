import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

const HEADER = '-----BEGIN CERTIFICATE-----';
const FOOTER = '-----END CERTIFICATE-----';
const SEPARATOR = '-----SEPARATOR-----';

export const x509CertificateHandler: (textEditor: TextEditor) => void = (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const appendSeparator = (text: string) => {
    let s = text;
    s = s.includes(HEADER) ? s : `${HEADER}\n${s.trim()}`;
    s = s.includes(FOOTER) ? s : `${s.trim()}\n${FOOTER}`;
    return s;
  };
  const selectedText = appendSeparator(textEditor.selections
    .map(selection => textEditor.document.getText(selection))
    .join("\n"));
  const { X509Certificate } = require('node:crypto');
  const array = selectedText.replaceAll(FOOTER, FOOTER + SEPARATOR).split(SEPARATOR);
  const content = array.map(text => {
    if (text.includes(HEADER) && text.includes(FOOTER)) {
      const cert = new X509Certificate(text);
      return JSON.stringify({
        subject: cert.subject,
        subjectAltName: cert.subjectAltName,
        issuer: cert.issuer,
        infoAccess: cert.infoAccess,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        fingerprint: cert.fingerprint,
        fingerprint256: cert.fingerprint256,
        fingerprint512: cert.fingerprint512,
        keyUsage: cert.keyUsage,
        serialNumber: cert.serialNumber
      }, null, 2);
    } else {
      '';
    }
  }).filter(x => x !== '').join('\n');
  openTextDocument(content);
};
