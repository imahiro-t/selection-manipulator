/**
 * Pure (vscode-independent) command table of the JAUNIX-008..014 Unicode commands (group JAUNI2).
 * They run through the UNI command handler, so the selections, the output limit, the
 * notifications and the logging are those of the UNI commands.
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency.
 */
import { assertUniInputLength, assertWithinBudget } from './uniCommon';
import {
  escapePython,
  fromRegionalIndicators,
  toMathDoubleStruck,
  toMathFraktur,
  toMathScript,
  toRegionalIndicators,
  toSmallCapitals,
} from './uni2Convert';
import { UniCommandEntry, UniTransform } from './uniTransforms';

/** A transform of the whole text with the output budget; the input limit and the result length are checked. */
const withBudget = (convert: (value: string, budget: number) => string): UniTransform =>
  (value, _context, budget) => {
    assertUniInputLength(value);
    const result = convert(value, budget);
    assertWithinBudget(result.length, budget);
    return result;
  };

/** A transform of the whole text (line breaks kept). */
const text = (convert: (value: string) => string): UniTransform => withBudget((value) => convert(value));

/** The commands in the order of the JAUNIX commands of the showcase data (scripts/showcase-data/JAUNIX.json). */
export const UNI2_COMMAND_ENTRIES: readonly UniCommandEntry[] = [
  {
    id: 'JAUNIX-008', name: 'unicode.style-script', title: 'Unicode - Mathematical Script', output: 'replace',
    transform: text(toMathScript),
  },
  {
    id: 'JAUNIX-009', name: 'unicode.style-fraktur', title: 'Unicode - Mathematical Fraktur', output: 'replace',
    transform: text(toMathFraktur),
  },
  {
    id: 'JAUNIX-010', name: 'unicode.style-double-struck', title: 'Unicode - Mathematical Double-struck', output: 'replace',
    transform: text(toMathDoubleStruck),
  },
  {
    id: 'JAUNIX-011', name: 'unicode.style-small-caps', title: 'Unicode - Small Capitals', output: 'replace',
    transform: text(toSmallCapitals),
  },
  {
    id: 'JAUNIX-012', name: 'unicode.escape-python', title: 'Escape Unicode (Python \\U00XXXXXX)', output: 'new-tab',
    transform: withBudget(escapePython),
  },
  {
    id: 'JAUNIX-013', name: 'unicode.to-regional-indicators', title: 'Unicode - Country Code to Flag Emoji', output: 'replace',
    transform: text(toRegionalIndicators),
  },
  {
    id: 'JAUNIX-014', name: 'unicode.from-regional-indicators', title: 'Unicode - Flag Emoji to Country Code', output: 'replace',
    transform: text(fromRegionalIndicators),
  },
];
