import * as vscode from 'vscode';
import { selectOthersHandler } from './handler/selectOthersHandler';
import { extractHandler } from './handler/extractHandler';
import { reverseHandler } from './handler/reverseHandler';
import { shuffleHandler } from './handler/shuffleHandler';
import { sortHandler } from './handler/sortHandler';
import { uniqueHandler } from './handler/uniqueHandler';
import { countOccurrencesHandler } from './handler/countOccurrencesHandler';
import { calculationHandler } from './handler/calculationHandler';
import { calcDateHandler } from './handler/calcDateHandler';
import { jsonHandler } from './handler/jsonHandler';
import { regexpHandler } from './handler/regexpHandler';
import { base64Handler } from './handler/base64Handler';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.select-others.match-case.match-word', selectOthersHandler(true, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.select-others.match-case.ignore-word', selectOthersHandler(true, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.select-others.ignore-case.match-word', selectOthersHandler(false, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.select-others.ignore-case.ignore-word', selectOthersHandler(false, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.extract', extractHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.reverse', reverseHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.shuffle', shuffleHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.sort.string.ascending', sortHandler('string', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.sort.string.descending', sortHandler('string', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.sort.number.ascending', sortHandler('number', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.sort.number.descending', sortHandler('number', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.unique', uniqueHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.count-occurrences.count', countOccurrencesHandler('count')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.count-occurrences.word', countOccurrencesHandler('word')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.calculation', calculationHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.calculation.date', calcDateHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.json.format', jsonHandler('format')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.json.minify', jsonHandler('minify')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.json.parse', jsonHandler('parse')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.json.stringify', jsonHandler('stringify')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.regex.g', regexpHandler('g')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.regex.gi', regexpHandler('gi')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.base64.encode', base64Handler('encode')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.base64.decode', base64Handler('decode')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.base64.deflate', base64Handler('deflate')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-processing-tools.base64.unzip', base64Handler('inflate')));
}

export function deactivate() { }
