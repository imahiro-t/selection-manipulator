import {
  TextEditor,
  window,
} from 'vscode';
import { openTextDocument } from '../common';
import axios from 'axios';

type config = {
  token_endpoint?: string,
  audience?: string,
  client_id?: string,
  client_secret?: string,
  scope?: string
};

export const clientCredentialsFlowHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  const querystring = require('node:querystring');

  const selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  const config = getConfig(selectedText);
  if (!config.token_endpoint) {
    config.token_endpoint = selectedText.trim();
    const regex = /^(http:\/\/|https:\/\/)/;
    if (!regex.test(config.token_endpoint)) {
      config.token_endpoint = await window.showInputBox({
        prompt: 'token_endpoint',
        placeHolder: ``,
        ignoreFocusOut: true,
      });
    }
  }
  if (!config.audience) {
    config.audience = await window.showInputBox({
      prompt: 'audience',
      placeHolder: ``,
      ignoreFocusOut: true,
    });
  }
  if (!config.client_id) {
    config.client_id = await window.showInputBox({
      prompt: 'client_id',
      placeHolder: ``,
      ignoreFocusOut: true,
    });
  }
  if (!config.client_secret) {
    config.client_secret = await window.showInputBox({
      prompt: 'client_secret',
      placeHolder: ``,
      ignoreFocusOut: true,
    });
  }
  if (!config.scope) {
    config.scope = await window.showInputBox({
      prompt: 'scope',
      placeHolder: ``,
      ignoreFocusOut: true,
    });
  }
  if (!config.token_endpoint || !config.token_endpoint.startsWith('http')) {
    return;
  }
  const params = querystring.stringify({
    grant_type: "client_credentials",
    audience: config.audience,
    client_id: config.client_id,
    client_secret: config.client_secret,
    scope: config.scope
  });
  const response = await axios.post(config.token_endpoint, params);
  const content = JSON.stringify(response.data, null, 2);
  openTextDocument(content);
};

const getConfig: (text: string) => config = (text) => {
  try {
    const parsed = JSON.parse(text);
    return ({
      token_endpoint: parsed.token_endpoint,
      audience: parsed.audience,
      client_id: parsed.client_id,
      client_secret: parsed.client_secret,
      scope: parsed.scope
    });
  } catch (_e) {
    return {};
  }
}