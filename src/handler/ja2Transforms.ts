/**
 * Pure (vscode-independent) command table of the JAUNIX-001..007 Japanese text commands (group
 * JAUNI2). They run through the JA command handler, so the selections, the quick pick, the output
 * limit, the notifications and the logging are those of the JA commands.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency.
 */
import { assertJaInputLength, assertWithinBudget, mapJaLines } from './jaCommon';
import {
  corporateNumberMessage,
  DakutenStyle,
  decomposeDakuten,
  gojuonRow,
  manOkuNotation,
  normalizeForSearch,
  parenReadingToRuby,
  verticalText,
} from './ja2Convert';
import { JaCommandEntry, JaContext, JaTransform } from './jaTransforms';

/** A transform of the whole text with the context; the input limit and the output budget are checked. */
const withContext = (convert: (value: string, context: JaContext, budget: number) => string): JaTransform =>
  (value, context, budget) => {
    assertJaInputLength(value);
    const result = convert(value, context, budget);
    assertWithinBudget(result.length, budget);
    return result;
  };

/** A transform of the whole text (every character, line breaks kept). */
const text = (convert: (value: string) => string): JaTransform => withContext((value) => convert(value));

/** A transform of one value per line (blank lines and the spaces around each value are kept). */
const lines = (convert: (value: string) => string): JaTransform =>
  (value, _context, budget) => mapJaLines(value, budget, convert);

const dakutenStyle = (context: JaContext): DakutenStyle => (context.choice === 'combining' ? 'combining' : 'spacing');

/** The commands in the order of the JAUNIX commands of the showcase data (scripts/showcase-data/JAUNIX.json). */
export const JA2_COMMAND_ENTRIES: readonly JaCommandEntry[] = [
  {
    id: 'JAUNIX-001', name: 'japanese.vertical-text', title: 'Japanese - Convert to Vertical Text', output: 'new-tab',
    transform: withContext((value, context, budget) => verticalText(value, context.eol, budget)),
  },
  {
    id: 'JAUNIX-002', name: 'japanese.gojuon-row', title: 'Japanese - Gojuon Row (Index Heading)', output: 'replace',
    transform: lines(gojuonRow),
  },
  {
    id: 'JAUNIX-003', name: 'japanese.normalize-for-search', title: 'Japanese - Normalize for Search', output: 'replace',
    transform: text(normalizeForSearch),
  },
  {
    id: 'JAUNIX-004', name: 'japanese.man-oku-notation', title: 'Japanese - Number to Man/Oku Notation', output: 'replace',
    transform: lines(manOkuNotation),
  },
  {
    id: 'JAUNIX-005', name: 'japanese.corporate-number-validate', title: 'Japanese - Validate Corporate Number', output: 'notify',
    combine: (texts) => corporateNumberMessage(texts),
  },
  {
    id: 'JAUNIX-006', name: 'japanese.decompose-dakuten', title: 'Japanese - Decompose Dakuten', output: 'replace',
    quickPick: {
      placeHolder: 'Write the voiced and semi-voiced sound marks as',
      items: [
        { label: '゛ ゜ Spacing Marks', description: 'U+309B / U+309C', value: 'spacing' },
        { label: 'Combining Marks', description: 'U+3099 / U+309A', value: 'combining' },
      ],
    },
    transform: withContext((value, context) => decomposeDakuten(value, dakutenStyle(context))),
  },
  {
    id: 'JAUNIX-007', name: 'japanese.paren-reading-to-ruby', title: 'Japanese - Parenthesized Reading to Ruby Notation', output: 'replace',
    transform: text(parenReadingToRuby),
  },
];
