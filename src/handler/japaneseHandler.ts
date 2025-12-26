import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

export const fullWidthToHalfWidthHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (str: string) => {
    // Alphanumeric
    str = str.replace(/[！-～]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/　/g, ' ');

    // Kana Map
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

    // Convert Hiragana to Katakana first, then map to Half-width
    const toKatakana = (s: string) => {
      return s.replace(/[\u3041-\u3096]/g, (match) => {
        return String.fromCharCode(match.charCodeAt(0) + 0x60);
      });
    };

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
    return str.replace(/[!-~]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) + 0xFEE0);
    }).replace(/ /g, '　');
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
    return str.replace(/[\u3041-\u3096]/g, (match) => {
      const chr = match.charCodeAt(0) + 0x60;
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

export const katakanaToHiraganaHandler: (replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (replace) => (textEditor) => {
  const convert = (str: string) => {
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
