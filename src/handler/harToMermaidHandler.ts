import {
  TextEditor,
  QuickPickItem,
  window,
  ViewColumn,
  Uri,
  workspace,
  FileType,
} from 'vscode';
import { randomBytes } from 'crypto';
import { openTextDocument } from '../common';

const DIAGRAM_HEADER = '```mermaid';
const DIAGRAM_FOOTER = '```';

type Command = 'mermaid' | 'image';

/** Shown when the bundled mermaid cannot be used. A fixed text: never any data of the user. */
export const MERMAID_MISSING_MESSAGE = 'HAR to Sequence Diagram Image could not start: the bundled mermaid (media/mermaid/mermaid.min.js) is missing. Reinstall the extension.';

/** Shown in the webview when the bundled mermaid did not load there. A fixed text. */
export const MERMAID_LOAD_FAILED_MESSAGE = 'Could not load the bundled mermaid. Reinstall the extension.';

export interface HarDependencies {
  notifier: { showErrorMessage(message: string): Thenable<unknown> };
}

export const defaultHarDependencies: HarDependencies = { notifier: window };

const bundledMermaidUri = (extensionUri: Uri): Uri => Uri.joinPath(extensionUri, 'media', 'mermaid', 'mermaid.min.js');

/**
 * Checks that the bundled `media/mermaid/mermaid.min.js` exists (it is copied there by
 * scripts/copy-mermaid.mjs and can be missing from a broken install). Shows
 * `MERMAID_MISSING_MESSAGE` and returns false when it does not, so that no empty webview is opened.
 */
export const ensureBundledMermaid = async (extensionUri: Uri, deps: HarDependencies = defaultHarDependencies): Promise<boolean> => {
  let isFile = false;
  try {
    const stat = await workspace.fs.stat(bundledMermaidUri(extensionUri));
    isFile = (stat.type & FileType.File) !== 0;
  } catch (_e) {
    isFile = false;
  }
  if (!isFile) {
    void deps.notifier.showErrorMessage(MERMAID_MISSING_MESSAGE);
  }
  return isFile;
};

/**
 * @param extensionUri The extension's root URI. Required by the `image` command, whose webview
 *   loads the bundled mermaid from `media/mermaid/`; the `mermaid` (text) command does not use it.
 */
export const harToMermaidHandler: (command: Command, extensionUri?: Uri, deps?: HarDependencies) => (textEditor: TextEditor) => Promise<void> = (command, extensionUri, deps = defaultHarDependencies) => async (textEditor) => {
  const selectedText = textEditor.document.getText(textEditor.selection);
  if (!selectedText) {
    return;
  }
  const harObj = JSON.parse(selectedText);
  const entries = harObj['log']['entries'] ?? [];
  if (entries.length === 0) {
    return;
  }
  const hosts = unique(entries.map((entry: any) => getUrl(entry).host));
  const quickPickHostItems = hosts.map((host: string) => ({ label: host, picked: false }) as QuickPickItem);
  const hostOptions = { title: "Hosts Including", canPickMany: true };
  const pickedHostItems = await window.showQuickPick(quickPickHostItems, hostOptions) as unknown as QuickPickItem[];
  if (!pickedHostItems || pickedHostItems.length === 0) {
    return;
  }
  const pickedHosts = pickedHostItems.map(pickedItem => pickedItem.label);
  const resourceTypes = unique(entries.map((entry: any) => getResourceType(entry))).filter(x => x !== '');
  const quickPickResourceTypeItems = resourceTypes.map((resourceType: string) => ({ label: resourceType, picked: resourceType === 'document' }) as QuickPickItem);
  const resourceTypeOptions = { title: "Resource Types Including", canPickMany: true };
  const pickedResourceTypeItems = await window.showQuickPick(quickPickResourceTypeItems, resourceTypeOptions) as unknown as QuickPickItem[];
  if (!pickedResourceTypeItems || pickedResourceTypeItems.length === 0) {
    return;
  }
  const pickedResourceTypes = pickedResourceTypeItems.map(pickedItem => pickedItem.label);
  const filteredEntries = entries.filter((entry: any) =>
    pickedHosts.includes(getUrl(entry).host) && pickedResourceTypes.includes(getResourceType(entry))
  );
  const quickPickExtraItems = [
    { label: 'query string', picked: true },
    { label: 'cookies', picked: true },
  ] as QuickPickItem[];
  const extraOptions = { title: "Extra Including", canPickMany: true };
  const pickedExtraItems = await window.showQuickPick(quickPickExtraItems, extraOptions) as unknown as QuickPickItem[];
  const pickedExtras = pickedExtraItems.map(pickedItem => pickedItem.label);
  const includeQueryString = pickedExtras.find(extra => extra === 'query string') !== undefined;
  const includeCookies = pickedExtras.find(extra => extra === 'cookies') !== undefined;

  const content = createDocument(filteredEntries, includeQueryString, includeCookies);

  if (command === 'image') {
    // Checked here, after the quick picks and right before the webview is created, so that the
    // `mermaid` (text) command is not affected.
    if (!extensionUri) {
      void deps.notifier.showErrorMessage(MERMAID_MISSING_MESSAGE);
      return;
    }
    if (!await ensureBundledMermaid(extensionUri, deps)) {
      return;
    }
    openWebView(content, extensionUri);
  } else {
    openTextDocument(content);
  }
};

const unique: (array: Array<string>) => Array<string> = (array) => {
  return Array.from(new Set(array));
};

const getUrl: (entry: any) => URL = (entry) => {
  return new URL(entry['request']['url']);
};

const getResourceType: (entry: any) => string = (entry) => {
  if (entry['_resourceType']) {
    return entry['_resourceType'];
  }
  const headers = (entry['request']['headers'] ?? []) as Array<any>;
  const result = headers.find(header => header['name'].toLowerCase() === 'sec-fetch-dest');
  return result ? result.value : '';
};

export const createDocument: (filteredEntries: Array<any>, includeQueryString: boolean, includeCookie: boolean) => string = (filteredEntries, includeQueryString, includeCookie) => {
  const headers = [
    DIAGRAM_HEADER,
    'sequenceDiagram',
    'actor User as User'
  ];
  const participants = unique(filteredEntries.map((entry: any) => {
    const url = getUrl(entry);
    return url.host.toLowerCase();
  })).map(host => `participant ${getHostId(host)} as ${host}`);
  const diagrams = filteredEntries.map((entry: any) => {
    const url = getUrl(entry);
    const hostId = getHostId(url.host.toLowerCase());
    const requestQueryStrings = getRequestQueryStrings(entry);
    const requestCookies = getRequestCookies(entry);
    const responseCookies = getResponseCookies(entry);
    let requestNoteLine = '';
    if ((includeQueryString && requestQueryStrings.length > 0) || (includeCookie && requestCookies.length > 0)) {
      requestNoteLine = `Note right of User: `;
      if (includeQueryString && requestQueryStrings.length > 0) {
        requestNoteLine = requestNoteLine + `[query string]<br/>${requestQueryStrings.join('<br/>')}`;
        if (includeCookie && requestCookies.length > 0) {
          requestNoteLine = requestNoteLine + `<br/>`;
        }
      }
      if (includeCookie && requestCookies.length > 0) {
        requestNoteLine = requestNoteLine + `[cookies]<br/>${requestCookies.join('<br/>')}`;
      }
    }
    let responseNoteLine = '';
    if (includeCookie && responseCookies.length > 0) {
      responseNoteLine = `Note left of ${hostId}: `;
      responseNoteLine = responseNoteLine + `[cookies]<br/>${responseCookies.join('<br/>')}`;
    }
    return [
      `User ->>+ ${hostId}: ${entry['request']['method']} ${url.pathname}`,
      requestNoteLine,
      `${hostId} -->>- User: ${entry['response']['status']} ${entry['response']['statusText']}`,
      responseNoteLine,
    ].filter(x => x !== '').join('\n');
  }) as string[];
  return headers.concat(participants).concat(['']).concat(diagrams).concat([DIAGRAM_FOOTER]).concat(['']).join('\n');
};

const getHostId: (host: string) => string = (host) => {
  return host.replaceAll('.', '_').replaceAll(':', '__');
};

const getRequestQueryStrings: (entry: any) => string[] = (entry) => {
  return entry['request']['queryString'].map((x: any) => x.name);
};

const getRequestCookies: (entry: any) => string[] = (entry) => {
  return entry['request']['cookies'].map((x: any) => x.name);
};

const getResponseCookies: (entry: any) => string[] = (entry) => {
  return entry['response']['cookies'].map((x: any) => x.name);
};

export type MermaidTheme = 'dark' | 'default';

const openWebView: (content: string, extensionUri: Uri) => void = (content, extensionUri) => {
  const kind = window.activeColorTheme.kind;
  const theme: MermaidTheme = kind === 2 || kind === 3 ? 'dark' : 'default';
  const viewColumn = window.activeTextEditor?.viewColumn ?? 1;
  const openViewColumn = viewColumn === 1 ? ViewColumn.Beside : viewColumn;
  // mermaid is bundled with the extension (copied from node_modules by scripts/copy-mermaid.mjs),
  // so the webview only needs to read this one directory and never reaches the network.
  const mediaRoot = Uri.joinPath(extensionUri, 'media', 'mermaid');
  const panel = window.createWebviewPanel(
    'sequence',
    'Sequence Diagram',
    openViewColumn,
    {
      enableScripts: true,
      localResourceRoots: [mediaRoot],
    }
  );
  const scriptUri = panel.webview.asWebviewUri(bundledMermaidUri(extensionUri)).toString();
  const nonce = randomBytes(16).toString('base64');
  panel.webview.html = getWebviewContent(
    content.replace(DIAGRAM_HEADER, '').replace(DIAGRAM_FOOTER, ''),
    theme,
    scriptUri,
    panel.webview.cspSource,
    nonce,
  );
};

const escapeHtml = (unsafe: string): string => {
  return unsafe
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

/**
 * The inline script of the webview (run after the bundled mermaid script). A fixed text: no value is
 * spliced into it. Exported for the tests, which run it against stub `window` / `document` objects.
 */
export const WEBVIEW_BOOT_SCRIPT = `
        if (typeof window.mermaid === 'undefined') {
          document.getElementById('mermaid-error').hidden = false;
          document.querySelector('pre.mermaid').hidden = true;
        } else {
          window.mermaid.initialize({
            startOnLoad: true,
            theme: document.body.dataset.theme === 'dark' ? 'dark' : 'default'
          });
        }
      `;

/**
 * Builds the HTML of the sequence diagram webview (SECURITY.md §6).
 *
 * - `default-src 'none'`, and scripts only with the per-load nonce: no `'unsafe-inline'` /
 *   `'unsafe-eval'` script and no external origin. mermaid itself is the bundled
 *   `media/mermaid/mermaid.min.js` passed in as `scriptUri` (an `asWebviewUri` URI).
 * - `style-src` allows `'unsafe-inline'` because mermaid writes an inline `<style>` into each SVG
 *   it renders. §6 forbids inline *scripts*, not inline styles.
 * - The theme is passed as an escaped `data-theme` attribute (one of two fixed values) and read by
 *   the script, so no value is ever spliced into script source.
 * - When mermaid did not load (missing file, 404, blocked or broken script), `WEBVIEW_BOOT_SCRIPT`
 *   shows the hidden `#mermaid-error` element (a fixed text) instead of an empty page. An inline
 *   `onerror` attribute would not run under the nonce-only `script-src`, hence the check.
 */
export const getWebviewContent: (content: string, theme: MermaidTheme, scriptUri: string, cspSource: string, nonce: string) => string = (content, theme, scriptUri, cspSource, nonce) => {
  const safeContent = escapeHtml(content);
  const safeTheme: MermaidTheme = theme === 'dark' ? 'dark' : 'default';
  const safeNonce = escapeHtml(nonce);
  const safeCspSource = escapeHtml(cspSource);
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${safeNonce}'`,
    `style-src ${safeCspSource} 'unsafe-inline'`,
    `img-src ${safeCspSource} data:`,
    `font-src ${safeCspSource}`,
  ].join('; ') + ';';
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="${csp}">
    </head>
    <body data-theme="${safeTheme}">
      <p id="mermaid-error" hidden>${escapeHtml(MERMAID_LOAD_FAILED_MESSAGE)}</p>
      <pre class="mermaid">
${safeContent}
      </pre>
      <script nonce="${safeNonce}" src="${escapeHtml(scriptUri)}"></script>
      <script nonce="${safeNonce}">${WEBVIEW_BOOT_SCRIPT}</script>
    </body>
  </html>`;
};
