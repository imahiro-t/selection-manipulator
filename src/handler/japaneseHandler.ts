import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

const kanaMap: { [key: string]: string } = {
  '。': '｡', '、': '､', '「': '｢', '」': '｣', '・': '･', 'ー': 'ｰ',
  'ァ': 'ｧ', 'ア': 'ｱ', 'ィ': 'ｨ', 'イ': 'ｲ', 'ゥ': 'ｩ', 'ウ': 'ｳ', 'ェ': 'ｪ', 'エ': 'ｴ', 'ォ': 'ｫ', 'オ': 'ｵ',
  'カ': 'ｶ', 'ガ': 'ｶﾞ', 'キ': 'ｷ', 'ギ': 'ｷﾞ', 'ク': 'ｸ', 'グ': 'ｸﾞ', 'ケ': 'ｹ', 'ゲ': 'ｹﾞ', 'コ': 'ｺ', 'ゴ': 'ｺﾞ',
  'サ': 'ｻ', 'ザ': 'ｻﾞ', 'シ': 'ｼ', 'ジ': 'ｼﾞ', 'ス': 'ｽ', 'ズ': 'ｽﾞ', 'セ': 'ｾ', 'ゼ': 'ｾﾞ', 'ソ': 'ｿ', 'ゾ': 'ｿﾞ',
  'タ': 'ﾀ', 'ダ': 'ﾀﾞ', 'チ': 'ﾁ', 'ヂ': 'ﾁﾞ', 'ッ': 'ｯ', 'ツ': 'ﾂ', 'ヅ': 'ﾂﾞ', 'テ': 'ﾃ', 'デ': 'ﾃﾞ', 'ト': 'ﾄ', 'ド': 'ﾄﾞ',
  'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
  'ハ': 'ﾊ', 'バ': 'ﾊﾞ', 'パ': 'ﾊﾟ', 'ヒ': 'ﾋ', 'ビ': 'ﾋﾞ', 'ピ': 'ﾋﾟ', 'フ': 'ﾌ', 'ブ': 'ﾌﾞ', 'プ': 'ﾌﾟ', 'ヘ': 'ﾍ', 'ベ': 'ﾍﾞ', 'ペ': 'ﾍﾟ', 'ホ': 'ﾎ', 'ボ': 'ﾎﾞ', 'ポ': 'ﾎﾟ',
  'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
  'ャ': 'ｬ', 'ヤ': 'ﾔ', 'ュ': 'ｭ', 'ユ': 'ﾕ', 'ョ': 'ｮ', 'ヨ': 'ﾖ',
  'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
  'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ', 'ヴ': 'ｳﾞ', 'ヵ': 'ｶ', 'ヶ': 'ｹ'
};

const halfKatakanaMap: { [key: string]: string } = {
  '｡': '。', '､': '、', '｢': '「', '｣': '」', '･': '・', 'ｰ': 'ー',
  'ｧ': 'ァ', 'ｱ': 'ア', 'ｨ': 'ィ', 'ｲ': 'イ', 'ｩ': 'ゥ', 'ｳ': 'ウ', 'ｪ': 'ェ', 'ｴ': 'エ', 'ｫ': 'ォ', 'ｵ': 'オ',
  'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
  'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
  'ﾀ': 'タ', 'ﾁ': 'チ', 'ｯ': 'ッ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
  'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
  'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
  'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
  'ｬ': 'ャ', 'ﾔ': 'ヤ', 'ｭ': 'ュ', 'ﾕ': 'ユ', 'ｮ': 'ョ', 'ﾖ': 'ヨ',
  'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
  'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
  'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
  'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
  'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
  'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
  'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
  'ｳﾞ': 'ヴ'
};

// Convert Hiragana to Katakana first, then map to Half-width
const toKatakana = (s: string) => {
  return s.replace(/[\u3041-\u3096]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) + 0x60);
  });
};

const toFullKatakana = (str: string) => {
  const reg = new RegExp('(' + Object.keys(halfKatakanaMap).join('|') + ')', 'g');
  return str.replace(reg, (match) => halfKatakanaMap[match]);
};


export const fullWidthToHalfWidthHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (str: string) => {
    // Alphanumeric
    str = str.replace(/[！-～]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/　/g, ' ');

    str = toKatakana(str);

    // Replace Full-width Katakana with Half-width
    const reg = new RegExp('(' + Object.keys(kanaMap).join('|') + ')', 'g');
    return str.replace(reg, (match) => kanaMap[match]);
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, convert(text));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => convert(textEditor.document.getText(selection))).join('\n');
    return openTextDocument(result).then(() => { });
  }
};

export const halfWidthToFullWidthHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (str: string) => {
    str = str.replace(/[!-~]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) + 0xFEE0);
    }).replace(/ /g, '　');

    return toFullKatakana(str);
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, convert(text));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => convert(textEditor.document.getText(selection))).join('\n');
    return openTextDocument(result).then(() => { });
  }
};

export const hiraganaToKatakanaHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (str: string) => {
    return toKatakana(str);
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, convert(text));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => convert(textEditor.document.getText(selection))).join('\n');
    return openTextDocument(result).then(() => { });
  }
};

export const katakanaToHiraganaHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (str: string) => {
    // First ensure we have full-width katakana
    str = toFullKatakana(str);

    return str.replace(/[\u30a1-\u30f6]/g, (match) => {
      const chr = match.charCodeAt(0) - 0x60;
      return String.fromCharCode(chr);
    });
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, convert(text));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => convert(textEditor.document.getText(selection))).join('\n');
    return openTextDocument(result).then(() => { });
  }
};
