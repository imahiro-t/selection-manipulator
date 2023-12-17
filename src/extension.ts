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
}

export function deactivate() { }
