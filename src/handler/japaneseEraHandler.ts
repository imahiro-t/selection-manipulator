import { TextEditor } from 'vscode';
import { openTextDocumentWithTitles } from '../common';

export const japaneseEraHandler = (replaceFlag: boolean) => async (textEditor: TextEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }

  const selections = textEditor.selections;

  const resultList = selections
    .map(selection => textEditor.document.getText(selection))
    .map(text => convertEra(text));

  if (replaceFlag) {
    await textEditor.edit(editBuilder => {
      selections.forEach((selection, index) => {
        editBuilder.replace(selection, resultList[index]);
      });
    });
  } else {
    const zip = selections
      .map((selection, index) => [textEditor.document.getText(selection), resultList[index]]);
    await openTextDocumentWithTitles(zip);
  }
};

const eras = [
  { name: '令和', start: 2019 },
  { name: '平成', start: 1989 },
  { name: '昭和', start: 1926 },
  { name: '大正', start: 1912 },
  { name: '明治', start: 1868 },
];

const convertEra = (text: string): string => {
  const trimmed = text.trim();

  // AD to Wareki: 2025 -> 令和7年, 2025年 -> 令和7年
  // Check if it's a 4-digit year
  const adMatch = trimmed.match(/^(\d{4})(?:年)?$/);
  if (adMatch) {
    const year = parseInt(adMatch[1], 10);
    for (const era of eras) {
      if (year >= era.start) {
        const eraYear = year - era.start + 1;
        const eraYearStr = eraYear === 1 ? '元' : eraYear.toString();
        return `${era.name}${eraYearStr}年`;
      }
    }
    return text; // Too old or invalid
  }

  // Wareki to AD: 令和7年 -> 2025年
  const warekiMatch = trimmed.match(/^(令和|平成|昭和|大正|明治)(元|\d+)(?:年)?$/);
  if (warekiMatch) {
    const eraName = warekiMatch[1];
    const eraYearStr = warekiMatch[2];
    const eraYear = eraYearStr === '元' ? 1 : parseInt(eraYearStr, 10);

    const era = eras.find(e => e.name === eraName);
    if (era) {
      const adYear = era.start + eraYear - 1;
      return `${adYear}年`;
    }
  }

  return text;
};
