/**
 * Constant tables of the JA-001..035 Japanese text commands (plan 2-2). Everything is data kept
 * in the extension: no dictionary is loaded, no network or file is used.
 */

// ---------------------------------------------------------------------------------------------
// Romaji (JA-001 / 002 / 028 / 030 / 031)
// ---------------------------------------------------------------------------------------------

/** How a kana (or a kana with a small kana after it) is written: [Hepburn, Kunrei]. */
type Romaji = readonly [hepburn: string, kunrei: string];

const same = (romaji: string): Romaji => [romaji, romaji];

/** One hiragana (katakana are converted to hiragana first). */
export const KANA_ROMAJI: ReadonlyMap<string, Romaji> = new Map<string, Romaji>([
  ['あ', same('a')], ['い', same('i')], ['う', same('u')], ['え', same('e')], ['お', same('o')],
  ['か', same('ka')], ['き', same('ki')], ['く', same('ku')], ['け', same('ke')], ['こ', same('ko')],
  ['さ', same('sa')], ['し', ['shi', 'si']], ['す', same('su')], ['せ', same('se')], ['そ', same('so')],
  ['た', same('ta')], ['ち', ['chi', 'ti']], ['つ', ['tsu', 'tu']], ['て', same('te')], ['と', same('to')],
  ['な', same('na')], ['に', same('ni')], ['ぬ', same('nu')], ['ね', same('ne')], ['の', same('no')],
  ['は', same('ha')], ['ひ', same('hi')], ['ふ', ['fu', 'hu']], ['へ', same('he')], ['ほ', same('ho')],
  ['ま', same('ma')], ['み', same('mi')], ['む', same('mu')], ['め', same('me')], ['も', same('mo')],
  ['や', same('ya')], ['ゆ', same('yu')], ['よ', same('yo')],
  ['ら', same('ra')], ['り', same('ri')], ['る', same('ru')], ['れ', same('re')], ['ろ', same('ro')],
  ['わ', same('wa')], ['ゐ', same('i')], ['ゑ', same('e')], ['を', same('o')],
  ['が', same('ga')], ['ぎ', same('gi')], ['ぐ', same('gu')], ['げ', same('ge')], ['ご', same('go')],
  ['ざ', same('za')], ['じ', ['ji', 'zi']], ['ず', same('zu')], ['ぜ', same('ze')], ['ぞ', same('zo')],
  ['だ', same('da')], ['ぢ', ['ji', 'zi']], ['づ', same('zu')], ['で', same('de')], ['ど', same('do')],
  ['ば', same('ba')], ['び', same('bi')], ['ぶ', same('bu')], ['べ', same('be')], ['ぼ', same('bo')],
  ['ぱ', same('pa')], ['ぴ', same('pi')], ['ぷ', same('pu')], ['ぺ', same('pe')], ['ぽ', same('po')],
  ['ゔ', same('vu')],
  // Small kana on their own (not after a kana they combine with).
  ['ぁ', same('a')], ['ぃ', same('i')], ['ぅ', same('u')], ['ぇ', same('e')], ['ぉ', same('o')],
  ['ゃ', same('ya')], ['ゅ', same('yu')], ['ょ', same('yo')], ['ゎ', same('wa')],
  ['ゕ', same('ka')], ['ゖ', same('ke')],
]);

/** A hiragana followed by a small kana, written as one syllable. */
export const KANA_DIGRAPH_ROMAJI: ReadonlyMap<string, Romaji> = new Map<string, Romaji>([
  ['きゃ', same('kya')], ['きゅ', same('kyu')], ['きょ', same('kyo')],
  ['しゃ', ['sha', 'sya']], ['しゅ', ['shu', 'syu']], ['しょ', ['sho', 'syo']], ['しぇ', ['she', 'sye']],
  ['ちゃ', ['cha', 'tya']], ['ちゅ', ['chu', 'tyu']], ['ちょ', ['cho', 'tyo']], ['ちぇ', ['che', 'tye']],
  ['にゃ', same('nya')], ['にゅ', same('nyu')], ['にょ', same('nyo')],
  ['ひゃ', same('hya')], ['ひゅ', same('hyu')], ['ひょ', same('hyo')],
  ['みゃ', same('mya')], ['みゅ', same('myu')], ['みょ', same('myo')],
  ['りゃ', same('rya')], ['りゅ', same('ryu')], ['りょ', same('ryo')],
  ['ぎゃ', same('gya')], ['ぎゅ', same('gyu')], ['ぎょ', same('gyo')],
  ['じゃ', ['ja', 'zya']], ['じゅ', ['ju', 'zyu']], ['じょ', ['jo', 'zyo']], ['じぇ', ['je', 'zye']],
  ['ぢゃ', ['ja', 'zya']], ['ぢゅ', ['ju', 'zyu']], ['ぢょ', ['jo', 'zyo']],
  ['びゃ', same('bya')], ['びゅ', same('byu')], ['びょ', same('byo')],
  ['ぴゃ', same('pya')], ['ぴゅ', same('pyu')], ['ぴょ', same('pyo')],
  // Sounds written with a small vowel (the same in both systems).
  ['ふぁ', same('fa')], ['ふぃ', same('fi')], ['ふぇ', same('fe')], ['ふぉ', same('fo')], ['ふゅ', same('fyu')],
  ['てぃ', same('ti')], ['でぃ', same('di')], ['とぅ', same('tu')], ['どぅ', same('du')],
  ['てゅ', same('tyu')], ['でゅ', same('dyu')],
  ['うぃ', same('wi')], ['うぇ', same('we')], ['うぉ', same('wo')], ['いぇ', same('ye')],
  ['ゔぁ', same('va')], ['ゔぃ', same('vi')], ['ゔぇ', same('ve')], ['ゔぉ', same('vo')],
  ['つぁ', same('tsa')], ['つぃ', same('tsi')], ['つぇ', same('tse')], ['つぉ', same('tso')],
  ['くぁ', same('kwa')], ['ぐぁ', same('gwa')],
]);

/** Katakana with no hiragana counterpart one code point away (ヷ..ヺ). */
export const KATAKANA_EXTRA_TO_HIRAGANA: ReadonlyMap<string, string> = new Map([
  ['ヷ', 'ゔぁ'], ['ヸ', 'ゔぃ'], ['ヹ', 'ゔぇ'], ['ヺ', 'ゔぉ'],
]);

/**
 * Romaji syllables (Hepburn and Kunrei spellings, `x` small kana) to hiragana, for JA-002.
 * Small kana spelled with `l` are deliberately missing (they would turn English words into kana).
 */
export const ROMAJI_TO_HIRAGANA: ReadonlyMap<string, string> = new Map([
  ['a', 'あ'], ['i', 'い'], ['u', 'う'], ['e', 'え'], ['o', 'お'],
  ['ka', 'か'], ['ki', 'き'], ['ku', 'く'], ['ke', 'け'], ['ko', 'こ'], ['kya', 'きゃ'], ['kyu', 'きゅ'], ['kyo', 'きょ'],
  ['kwa', 'くぁ'],
  ['sa', 'さ'], ['si', 'し'], ['shi', 'し'], ['su', 'す'], ['se', 'せ'], ['so', 'そ'],
  ['sha', 'しゃ'], ['shu', 'しゅ'], ['sho', 'しょ'], ['she', 'しぇ'], ['sya', 'しゃ'], ['syu', 'しゅ'], ['syo', 'しょ'], ['sye', 'しぇ'],
  ['ta', 'た'], ['ti', 'ち'], ['chi', 'ち'], ['tu', 'つ'], ['tsu', 'つ'], ['te', 'て'], ['to', 'と'],
  ['cha', 'ちゃ'], ['chu', 'ちゅ'], ['cho', 'ちょ'], ['che', 'ちぇ'], ['tya', 'ちゃ'], ['tyu', 'ちゅ'], ['tyo', 'ちょ'], ['tye', 'ちぇ'],
  ['tsa', 'つぁ'], ['tsi', 'つぃ'], ['tse', 'つぇ'], ['tso', 'つぉ'],
  ['na', 'な'], ['ni', 'に'], ['nu', 'ぬ'], ['ne', 'ね'], ['no', 'の'], ['nya', 'にゃ'], ['nyu', 'にゅ'], ['nyo', 'にょ'],
  ['ha', 'は'], ['hi', 'ひ'], ['hu', 'ふ'], ['fu', 'ふ'], ['he', 'へ'], ['ho', 'ほ'], ['hya', 'ひゃ'], ['hyu', 'ひゅ'], ['hyo', 'ひょ'],
  ['fa', 'ふぁ'], ['fi', 'ふぃ'], ['fe', 'ふぇ'], ['fo', 'ふぉ'], ['fyu', 'ふゅ'],
  ['ma', 'ま'], ['mi', 'み'], ['mu', 'む'], ['me', 'め'], ['mo', 'も'], ['mya', 'みゃ'], ['myu', 'みゅ'], ['myo', 'みょ'],
  ['ya', 'や'], ['yu', 'ゆ'], ['yo', 'よ'], ['ye', 'いぇ'],
  ['ra', 'ら'], ['ri', 'り'], ['ru', 'る'], ['re', 'れ'], ['ro', 'ろ'], ['rya', 'りゃ'], ['ryu', 'りゅ'], ['ryo', 'りょ'],
  ['wa', 'わ'], ['wo', 'を'], ['wi', 'うぃ'], ['we', 'うぇ'],
  ['ga', 'が'], ['gi', 'ぎ'], ['gu', 'ぐ'], ['ge', 'げ'], ['go', 'ご'], ['gya', 'ぎゃ'], ['gyu', 'ぎゅ'], ['gyo', 'ぎょ'], ['gwa', 'ぐぁ'],
  ['za', 'ざ'], ['zi', 'じ'], ['ji', 'じ'], ['zu', 'ず'], ['ze', 'ぜ'], ['zo', 'ぞ'],
  ['ja', 'じゃ'], ['ju', 'じゅ'], ['jo', 'じょ'], ['je', 'じぇ'], ['jya', 'じゃ'], ['jyu', 'じゅ'], ['jyo', 'じょ'],
  ['zya', 'じゃ'], ['zyu', 'じゅ'], ['zyo', 'じょ'], ['zye', 'じぇ'],
  ['da', 'だ'], ['di', 'ぢ'], ['du', 'づ'], ['de', 'で'], ['do', 'ど'], ['dya', 'ぢゃ'], ['dyu', 'ぢゅ'], ['dyo', 'ぢょ'],
  ['ba', 'ば'], ['bi', 'び'], ['bu', 'ぶ'], ['be', 'べ'], ['bo', 'ぼ'], ['bya', 'びゃ'], ['byu', 'びゅ'], ['byo', 'びょ'],
  ['pa', 'ぱ'], ['pi', 'ぴ'], ['pu', 'ぷ'], ['pe', 'ぺ'], ['po', 'ぽ'], ['pya', 'ぴゃ'], ['pyu', 'ぴゅ'], ['pyo', 'ぴょ'],
  ['va', 'ゔぁ'], ['vi', 'ゔぃ'], ['vu', 'ゔ'], ['ve', 'ゔぇ'], ['vo', 'ゔぉ'],
  ['xa', 'ぁ'], ['xi', 'ぃ'], ['xu', 'ぅ'], ['xe', 'ぇ'], ['xo', 'ぉ'],
  ['xya', 'ゃ'], ['xyu', 'ゅ'], ['xyo', 'ょ'], ['xtu', 'っ'], ['xtsu', 'っ'], ['xwa', 'ゎ'], ['xka', 'ゕ'], ['xke', 'ゖ'],
]);

/** The longest key of ROMAJI_TO_HIRAGANA. */
export const ROMAJI_MAX_LENGTH = 4;

// ---------------------------------------------------------------------------------------------
// Kanji numerals and daiji (JA-003 / 004 / 005 / 032 / 033)
// ---------------------------------------------------------------------------------------------

/** 0..9 as kanji numerals. */
export const KANJI_DIGITS: readonly string[] = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** 0..9 as daiji (tamper-resistant numerals used in documents): 零 and 壱弐参, then 四..九. */
export const DAIJI_DIGITS: readonly string[] = ['零', '壱', '弐', '参', '四', '五', '六', '七', '八', '九'];
/** 10, 100, 1000 in kanji numerals and in daiji. */
export const KANJI_SMALL_UNITS: readonly string[] = ['十', '百', '千'];
export const DAIJI_SMALL_UNITS: readonly string[] = ['拾', '百', '千'];
/** 10^4, 10^8, 10^12, 10^16 in kanji numerals and in daiji. */
export const KANJI_LARGE_UNITS: readonly string[] = ['万', '億', '兆', '京'];
export const DAIJI_LARGE_UNITS: readonly string[] = ['萬', '億', '兆', '京'];

/** Every digit character JA-004 reads (kanji numerals, daiji and their older forms, full-width and ASCII digits). */
export const NUMERAL_DIGIT_VALUES: ReadonlyMap<string, number> = new Map([
  ['〇', 0], ['零', 0], ['一', 1], ['壱', 1], ['壹', 1], ['二', 2], ['弐', 2], ['貳', 2], ['三', 3], ['参', 3], ['參', 3],
  ['四', 4], ['肆', 4], ['五', 5], ['伍', 5], ['六', 6], ['陸', 6], ['七', 7], ['漆', 7], ['八', 8], ['捌', 8], ['九', 9], ['玖', 9],
  ...Array.from({ length: 10 }, (_, i): [string, number] => [String(i), i]),
  ...Array.from({ length: 10 }, (_, i): [string, number] => [String.fromCharCode(0xFF10 + i), i]),
]);

/** The units below 10^4 JA-004 reads. */
export const NUMERAL_SMALL_UNIT_VALUES: ReadonlyMap<string, bigint> = new Map([
  ['十', 10n], ['拾', 10n], ['百', 100n], ['佰', 100n], ['千', 1000n], ['阡', 1000n], ['仟', 1000n],
]);

/** The units from 10^4 JA-004 reads. */
export const NUMERAL_LARGE_UNIT_VALUES: ReadonlyMap<string, bigint> = new Map([
  ['万', 10_000n], ['萬', 10_000n], ['億', 100_000_000n], ['兆', 1_000_000_000_000n], ['京', 10_000_000_000_000_000n],
]);

// ---------------------------------------------------------------------------------------------
// Kyujitai / shinjitai (JA-008 / 009 / 034)
// ---------------------------------------------------------------------------------------------

/**
 * `新舊` pairs: the old forms shown in parentheses in the Joyo Kanji table that are encoded as
 * unified ideographs (the old forms that exist only as CJK compatibility ideographs, such as 海 and
 * 社, are handled by KYUJITAI_COMPATIBILITY_RANGE). 弁 has three old forms (辨 瓣 辯).
 */
const KYUJITAI_PAIRS = [
  '亜亞 悪惡 圧壓 囲圍 為爲 医醫 壱壹 隠隱 栄榮 営營 衛衞 駅驛 円圓 塩鹽 縁緣 艶艷 応應 欧歐 殴毆 桜櫻 奥奧 横橫 温溫 穏穩',
  '仮假 価價 画畫 会會 絵繪 壊壞 懐懷 概槪 拡擴 殻殼 覚覺 学學 岳嶽 楽樂 渇渴 缶罐 巻卷 陥陷 勧勸 寛寬 関關 歓歡 観觀',
  '気氣 既旣 帰歸 亀龜 偽僞 戯戲 犠犧 旧舊 拠據 挙擧 虚虛 峡峽 挟挾 狭狹 郷鄕 暁曉 区區 駆驅 勲勳 薫薰',
  '径徑 茎莖 恵惠 掲揭 渓溪 経經 蛍螢 軽輕 継繼 鶏鷄 芸藝 撃擊 欠缺 研硏 県縣 倹儉 剣劍 険險 圏圈 検檢 献獻 権權 顕顯 験驗 厳嚴',
  '呉吳 娯娛 広廣 効效 恒恆 黄黃 鉱鑛 号號 国國 黒黑',
  '砕碎 済濟 斎齋 剤劑 雑雜 参參 桟棧 蚕蠶 惨慘 賛贊 残殘 糸絲 歯齒 児兒 辞辭 湿濕 実實 写寫 釈釋 寿壽 収收 従從 渋澁 獣獸 縦縱 粛肅',
  '処處 緒緖 叙敍 将將 称稱 渉涉 焼燒 証證 奨奬 条條 状狀 乗乘 浄淨 剰剩 畳疊 縄繩 壌壤 嬢孃 譲讓 醸釀 触觸 嘱囑 真眞 寝寢 慎愼 尽盡',
  '図圖 粋粹 酔醉 穂穗 随隨 髄髓 枢樞 数數 瀬瀨 声聲 斉齊 静靜 窃竊 摂攝 専專 浅淺 戦戰 践踐 銭錢 潜潛 繊纖 禅禪',
  '双雙 壮壯 争爭 荘莊 捜搜 挿插 巣巢 曽曾 痩瘦 装裝 総總 騒騷 増增 蔵藏 臓臟 即卽 属屬 続續',
  '堕墮 対對 体體 帯帶 滞滯 台臺 滝瀧 択擇 沢澤 担擔 単單 胆膽 団團 断斷 弾彈 遅遲 痴癡 虫蟲 昼晝 鋳鑄 庁廳 徴徵 聴聽 勅敕 鎮鎭',
  '逓遞 鉄鐵 点點 転轉 伝傳 灯燈 当當 党黨 盗盜 稲稻 闘鬭 徳德 独獨 読讀 届屆 弐貳 悩惱 脳腦',
  '覇霸 拝拜 廃廢 売賣 麦麥 発發 髪髮 抜拔 晩晚 蛮蠻 秘祕 浜濱 瓶甁 払拂 仏佛 併倂 並竝 餅餠 辺邊 変變 弁辨 弁瓣 弁辯 歩步 宝寶 豊豐 褒襃',
  '毎每 万萬 満滿 麺麵 黙默 弥彌 訳譯 薬藥 与與 予豫 余餘 誉譽 揺搖 様樣 謡謠 来來 頼賴 乱亂 覧覽',
  '竜龍 両兩 猟獵 緑綠 涙淚 塁壘 礼禮 励勵 戻戾 霊靈 齢齡 暦曆 歴歷 恋戀 錬鍊 炉爐 労勞 郎郞 楼樓 録錄 湾灣 翻飜',
].join(' ').split(' ').map((pair): [string, string] => [pair[0], pair[1]]);

/**
 * The CJK compatibility ideographs U+FA30..FA6A (old forms such as 海 社 祝 from JIS X 0213):
 * JA-008 turns each into its canonical (NFC) character. JA-009 never produces them.
 */
export const KYUJITAI_COMPATIBILITY_RANGE: readonly [number, number] = [0xFA30, 0xFA6A];

/** Old form → new form (JA-008 / 034). */
export const KYUJITAI_TO_SHINJITAI: ReadonlyMap<string, string> = new Map([
  ...KYUJITAI_PAIRS.map(([shin, kyu]): [string, string] => [kyu, shin]),
  ...Array.from({ length: KYUJITAI_COMPATIBILITY_RANGE[1] - KYUJITAI_COMPATIBILITY_RANGE[0] + 1 }, (_, i): [string, string] => {
    const ch = String.fromCodePoint(KYUJITAI_COMPATIBILITY_RANGE[0] + i);
    return [ch, ch.normalize('NFC')];
  }),
]);

/**
 * New forms JA-009 leaves as they are: 弁 has several old forms (辨 瓣 辯), and the others are
 * also old characters in their own right with a different meaning (芸 is a herb, 欠 means to
 * yawn, 予 means I, and so on), so changing them could change the text.
 */
export const SHINJITAI_NOT_CONVERTED: ReadonlySet<string> = new Set(['弁', '芸', '欠', '予', '余', '台', '糸', '缶', '虫']);

/** New form → old form (JA-009), without SHINJITAI_NOT_CONVERTED. */
export const SHINJITAI_TO_KYUJITAI: ReadonlyMap<string, string> = new Map(
  KYUJITAI_PAIRS.filter(([shin]) => !SHINJITAI_NOT_CONVERTED.has(shin))
);

// ---------------------------------------------------------------------------------------------
// Small kana (JA-010)
// ---------------------------------------------------------------------------------------------

const zip = (from: string, to: string): [string, string][] => {
  const a = [...from];
  const b = [...to];
  if (a.length !== b.length) {
    throw new Error('table lengths differ');
  }
  return a.map((ch, i) => [ch, b[i]]);
};

/** Small kana → normal kana (hiragana, katakana, ㇰ..ㇿ, half-width katakana). */
export const SMALL_TO_NORMAL_KANA: ReadonlyMap<string, string> = new Map([
  ...zip('ぁぃぅぇぉっゃゅょゎゕゖ', 'あいうえおつやゆよわかけ'),
  ...zip('ァィゥェォッャュョヮヵヶ', 'アイウエオツヤユヨワカケ'),
  ...zip('ㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ', 'クシストヌハヒフヘホムラリルレロ'),
  ...zip('ｧｨｩｪｫｬｭｮｯ', 'ｱｲｳｴｵﾔﾕﾖﾂ'),
]);

// ---------------------------------------------------------------------------------------------
// Hiragana to half-width katakana (JA-024)
// ---------------------------------------------------------------------------------------------

const HALFWIDTH_BASE = new Map(zip(
  'ぁあぃいぅうぇえぉおかきくけこさしすせそたちっつてとなにぬねのはひふへほまみむめもゃやゅゆょよらりるれろわをんゕゖ',
  'ｧｱｨｲｩｳｪｴｫｵｶｷｸｹｺｻｼｽｾｿﾀﾁｯﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓｬﾔｭﾕｮﾖﾗﾘﾙﾚﾛﾜｦﾝｶｹ'
));

/**
 * Hiragana → half-width katakana. The keys are hiragana (U+3041..3096) only; voiced and
 * semi-voiced kana become two characters (が → ｶﾞ, ぱ → ﾊﾟ, ゔ → ｳﾞ). ゎ ゐ ゑ have no half-width
 * form and are not keys.
 */
export const HIRAGANA_TO_HALFWIDTH: ReadonlyMap<string, string> = (() => {
  const table = new Map(HALFWIDTH_BASE);
  for (let code = 0x3041; code <= 0x3096; code++) {
    const ch = String.fromCodePoint(code);
    const [base, mark] = [...ch.normalize('NFD')];
    if (mark !== undefined && HALFWIDTH_BASE.has(base)) {
      table.set(ch, HALFWIDTH_BASE.get(base)! + (mark === '゙' ? 'ﾞ' : 'ﾟ'));
    }
  }
  return table;
})();

// ---------------------------------------------------------------------------------------------
// Prefectures (JA-022)
// ---------------------------------------------------------------------------------------------

/** The 47 prefectures in JIS X 0401 order (index + 1 = code): the official names. */
export const PREFECTURES: readonly string[] = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

/** The name without the suffix 都・府・県 (北海道 stays 北海道). */
export const prefectureShortName = (name: string): string => name.replace(/[都府県]$/u, '');

// ---------------------------------------------------------------------------------------------
// Circled and parenthesized numbers (JA-021)
// ---------------------------------------------------------------------------------------------

const numberRange = (first: number, count: number, start: number): [string, number][] =>
  Array.from({ length: count }, (_, i) => [String.fromCodePoint(first + i), start + i]);

/** ⓪, ①..⑳, ㉑..㉟, ㊱..㊿ and ⑴..⒇ → their numbers. */
export const CIRCLED_NUMBERS: ReadonlyMap<string, number> = new Map([
  ['⓪', 0],
  ...numberRange(0x2460, 20, 1),
  ...numberRange(0x3251, 15, 21),
  ...numberRange(0x32B1, 15, 36),
  ...numberRange(0x2474, 20, 1),
]);
