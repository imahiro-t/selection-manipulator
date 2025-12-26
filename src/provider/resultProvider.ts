import {
  TextDocumentContentProvider,
  Uri,
  EventEmitter,
  Event
} from 'vscode';

export class ResultProvider implements TextDocumentContentProvider {
  static scheme = 'selection-manipulator';
  private _onDidChange = new EventEmitter<Uri>();
  private _documents = new Map<string, string>();

  // Singleton instance
  private static _instance: ResultProvider;

  public static get instance(): ResultProvider {
    if (!ResultProvider._instance) {
      ResultProvider._instance = new ResultProvider();
    }
    return ResultProvider._instance;
  }

  get onDidChange(): Event<Uri> {
    return this._onDidChange.event;
  }

  provideTextDocumentContent(uri: Uri): string {
    return this._documents.get(uri.path) || '';
  }

  private _seq = 0;

  registerContent(content: string): Uri {
    const timestamp = new Date().getTime();
    this._seq = (this._seq + 1) % 1000;
    const path = `Result-${timestamp}-${this._seq}`;
    const uri = Uri.parse(`${ResultProvider.scheme}:${path}`);
    this._documents.set(path, content);
    return uri;
  }
}
