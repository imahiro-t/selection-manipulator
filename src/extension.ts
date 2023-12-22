import * as vscode from 'vscode';
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
import { xmlHandler } from './handler/xmlHandler';
import { multiSelectionHandler } from './handler/multiSelectionHandler';
import { countUpListHandler } from './handler/countUpListHandler';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.multi-selection', multiSelectionHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract', extractHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.exclude-blank-rows', extractHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.reverse', reverseHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.shuffle', shuffleHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.string.ascending', sortHandler('string', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.string.descending', sortHandler('string', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.number.ascending', sortHandler('number', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.number.descending', sortHandler('number', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.unique', uniqueHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.count-occurrences.count', countOccurrencesHandler('count')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.count-occurrences.word', countOccurrencesHandler('word')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.calculation', calculationHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.calculation.date', calcDateHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.format', jsonHandler('format')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.minify', jsonHandler('minify')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.parse', jsonHandler('parse')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.stringify', jsonHandler('stringify')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.regex.g', regexpHandler('g')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.regex.gi', regexpHandler('gi')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.encode', base64Handler('encode')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.decode', base64Handler('decode')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.deflate', base64Handler('deflate')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.unzip', base64Handler('inflate')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.xml.format', xmlHandler('format')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.xml.minify', xmlHandler('minify')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.count-up-list', countUpListHandler));
}

export function deactivate() { }
