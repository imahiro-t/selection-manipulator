import {
  TextEditor,
  QuickPickItem,
  window,
  ViewColumn,
} from 'vscode';
import { openTextDocument } from '../common';

const DIAGRAM_HEADER = '```mermaid';
const DIAGRAM_FOOTER = '```';

type Command = 'mermaid' | 'image';

export const harToMermaidHandler: (command: Command) => (textEditor: TextEditor) => void = (command) => async (textEditor) => {
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
    openWebView(content);
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

const createDocument: (filteredEntries: Array<any>, includeQueryString: boolean, includeCookie: boolean) => string = (filteredEntries, includeQueryString, includeCookie) => {
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

const openWebView: (content: string) => void = (content) => {
  const kind = window.activeColorTheme.kind;
  const theme = kind === 2 || kind === 3 ? 'dark' : 'default';
  const viewColumn = window.activeTextEditor?.viewColumn ?? 1;
  const openViewColumn = viewColumn === 1 ? ViewColumn.Beside : viewColumn;
  const panel = window.createWebviewPanel(
    'sequence',
    'Sequence Diagram',
    openViewColumn,
    {
      enableScripts: true
    }
  );
  panel.webview.html = getWebviewContent(content.replace(DIAGRAM_HEADER, '').replace(DIAGRAM_FOOTER, ''), theme);
};

const getWebviewContent: (content: string, theme: string) => string = (content, theme) => {
  return `<!DOCTYPE html>
  <html lang="en">
    <body>
      <pre class="mermaid">
      ${content}
      </pre>
      <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        var config = {
          startOnLoad:true,
          theme:'${theme}'
        };
        mermaid.initialize(config);
      </script>
    </body>
  </html>`;
};
