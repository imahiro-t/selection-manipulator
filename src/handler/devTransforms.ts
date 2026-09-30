/**
 * Pure (vscode-independent) command table of the DEV-001..035 developer commands.
 *
 * Every command converts each selection on its own and puts the result either in a new editor
 * (the base commands) or in place of the selection (the `(Replace)` variants).
 *
 * Only local processing: no network, files or processes, no `eval` / `new Function`, no new
 * dependency. SQL, shell, curl and HTML texts are only converted as strings, never run.
 */
import { chmodConvert, concatToTemplate, removeConsoleLog, semverBump, SemverPart, sortImports } from './devCode';
import { hexToHsl, hslToHex, toggleHexLength } from './devColor';
import { assertDevInputLength, assertWithinBudget, DevInputError } from './devCommon';
import { cssFormat, cssMinify } from './devCss';
import { curlToFetch } from './devCurl';
import { htmlToJsx } from './devHtmlJsx';
import { jsonToGoStruct, jsonToPythonTypedDict, jsonToTypeScript } from './devJsonTypes';
import {
  escapeCsvField,
  escapeMarkdown,
  escapeRegex,
  escapeSql,
  quotePosixShell,
  quotePowerShell,
  toGoRawString,
  toJavaString,
  toJsString,
  toPythonString,
  toTemplateLiteral,
} from './devLiterals';
import { sqlFormat, sqlMinify, sqlUppercaseKeywords } from './devSql';

/** Where a command puts its result. */
export type DevOutput = 'new-tab' | 'replace';

/** What a transform may use besides the text: made once per run by the handler. */
export interface DevContext {
  /** The line break of the document (`\n` or `\r\n`). */
  eol: string;
  /** The `value` of the quick pick item chosen before running (commands with `quickPick` only). */
  choice?: string;
}

/**
 * A transform of one selection. `budget` is what is left of MAX_OUTPUT_LENGTH; a longer result
 * throws `EncOutputTooLargeError`. An unusable text throws `DevInputError`.
 */
export type DevTransform = (text: string, context: DevContext, budget: number) => string;

/** One choice of the quick pick shown before running. */
export interface DevQuickPickItem {
  label: string;
  description?: string;
  value: string;
}

/** A quick pick shown once before running (for all selections). */
export interface DevQuickPick {
  placeHolder: string;
  items: readonly DevQuickPickItem[];
}

export interface DevCommandEntry {
  /** ROADMAP ID, e.g. `DEV-001`. */
  id: string;
  /** Command ID without the `selection-manipulator.` prefix. */
  name: string;
  /** Title in package.json / ROADMAP. */
  title: string;
  output: DevOutput;
  transform: DevTransform;
  /**
   * Whether a selection of only spaces, tabs and line breaks is converted too (the literal and
   * escaping commands: `'   '` is a meaningful result). Otherwise such selections are skipped.
   * Empty selections (a cursor only) are always skipped.
   */
  acceptsBlank: boolean;
  /** Asked once before running; the chosen value is `context.choice`. */
  quickPick?: DevQuickPick;
}

/**
 * A transform of the whole text with the context and the output budget. The input limit is
 * checked here, and the length of the result is counted against the budget.
 */
const withBudget = (convert: (value: string, context: DevContext, budget: number) => string): DevTransform =>
  (value, context, budget) => {
    assertDevInputLength(value);
    const result = convert(value, context, budget);
    assertWithinBudget(result.length, budget);
    return result;
  };

/** A transform of the whole text (line breaks kept). */
const text = (convert: (value: string) => string): DevTransform => withBudget((value) => convert(value));

const PREFIX = 'programmatic.';

/** A base command: its result opens in a new editor. */
interface BaseCommand {
  id: string;
  name: string;
  title: string;
  transform: DevTransform;
  acceptsBlank: boolean;
  quickPick?: DevQuickPick;
}

const base = (command: BaseCommand): DevCommandEntry => ({ ...command, name: `${PREFIX}${command.name}`, output: 'new-tab' });

/** The `(Replace)` variant `id` of a base command: the same transform, in place of the selection. */
const replaceOf = (id: string, of: DevCommandEntry): DevCommandEntry => ({
  ...of,
  id,
  name: `${of.name}.replace`,
  title: `${of.title} (Replace)`,
  output: 'replace',
});

const TO_JS_STRING = base({
  id: 'DEV-001', name: 'to-js-string', title: 'Convert to JS String Literal', acceptsBlank: true,
  transform: text(toJsString),
});
const ESCAPE_REGEX = base({
  id: 'DEV-006', name: 'escape-regex', title: 'Escape Regex Special Characters', acceptsBlank: true,
  transform: text(escapeRegex),
});
const ESCAPE_SQL = base({
  id: 'DEV-007', name: 'escape-sql', title: 'Escape SQL String Literal', acceptsBlank: true,
  transform: text(escapeSql),
});
const JSON_TO_TYPESCRIPT = base({
  id: 'DEV-012', name: 'json-to-typescript', title: 'Convert JSON to TypeScript Interface', acceptsBlank: false,
  transform: withBudget((value, context, budget) => jsonToTypeScript(value, context.eol, budget)),
});
const HTML_TO_JSX = base({
  id: 'DEV-027', name: 'html-to-jsx', title: 'Convert HTML to JSX', acceptsBlank: false,
  transform: withBudget((value, _context, budget) => htmlToJsx(value, budget)),
});
const SQL_FORMAT = base({
  id: 'DEV-015', name: 'sql-format', title: 'Format SQL', acceptsBlank: false,
  transform: withBudget((value, context, budget) => sqlFormat(value, context.eol, budget)),
});

/** The parts of a version DEV-028 can raise (the value is `context.choice`). */
const SEMVER_PARTS: readonly SemverPart[] = ['patch', 'minor', 'major'];

/** The commands in the order of the DEV commands of the showcase data (scripts/showcase-data/DEV.json). */
export const DEV_COMMAND_ENTRIES: readonly DevCommandEntry[] = [
  TO_JS_STRING,
  base({
    id: 'DEV-002', name: 'to-python-string', title: 'Convert to Python String Literal', acceptsBlank: true,
    transform: text(toPythonString),
  }),
  base({
    id: 'DEV-003', name: 'to-java-string', title: 'Convert to Java String Concatenation', acceptsBlank: true,
    transform: withBudget((value, context) => toJavaString(value, context.eol)),
  }),
  base({
    id: 'DEV-004', name: 'to-go-raw-string', title: 'Convert to Go Raw String', acceptsBlank: true,
    transform: text(toGoRawString),
  }),
  base({
    id: 'DEV-005', name: 'to-template-literal', title: 'Convert to JS Template Literal', acceptsBlank: true,
    transform: text(toTemplateLiteral),
  }),
  ESCAPE_REGEX,
  ESCAPE_SQL,
  base({
    id: 'DEV-008', name: 'quote-posix-shell', title: 'Quote for POSIX Shell', acceptsBlank: true,
    transform: text(quotePosixShell),
  }),
  base({
    id: 'DEV-009', name: 'quote-powershell', title: 'Quote for PowerShell', acceptsBlank: true,
    transform: text(quotePowerShell),
  }),
  base({
    id: 'DEV-010', name: 'escape-csv-field', title: 'Escape CSV Field', acceptsBlank: true,
    transform: text(escapeCsvField),
  }),
  base({
    id: 'DEV-011', name: 'escape-markdown', title: 'Escape Markdown Special Characters', acceptsBlank: true,
    transform: text(escapeMarkdown),
  }),
  JSON_TO_TYPESCRIPT,
  base({
    id: 'DEV-013', name: 'json-to-go-struct', title: 'Convert JSON to Go Struct', acceptsBlank: false,
    transform: withBudget((value, context, budget) => jsonToGoStruct(value, context.eol, budget)),
  }),
  base({
    id: 'DEV-014', name: 'json-to-python-typeddict', title: 'Convert JSON to Python TypedDict', acceptsBlank: false,
    transform: withBudget((value, context, budget) => jsonToPythonTypedDict(value, context.eol, budget)),
  }),
  SQL_FORMAT,
  base({
    id: 'DEV-016', name: 'sql-minify', title: 'Minify SQL', acceptsBlank: false,
    transform: text(sqlMinify),
  }),
  base({
    id: 'DEV-017', name: 'sql-uppercase-keywords', title: 'Uppercase SQL Keywords', acceptsBlank: false,
    transform: text(sqlUppercaseKeywords),
  }),
  base({
    id: 'DEV-018', name: 'css-minify', title: 'Minify CSS', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => cssMinify(value, budget)),
  }),
  base({
    id: 'DEV-019', name: 'css-format', title: 'Format CSS', acceptsBlank: false,
    transform: withBudget((value, context, budget) => cssFormat(value, context.eol, budget)),
  }),
  base({
    id: 'DEV-020', name: 'hex-to-hsl', title: 'Convert Hex to HSL', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => hexToHsl(value, budget)),
  }),
  base({
    id: 'DEV-021', name: 'hsl-to-hex', title: 'Convert HSL to Hex', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => hslToHex(value, budget)),
  }),
  base({
    id: 'DEV-022', name: 'hex-shorten-expand', title: 'Toggle Hex Color Short / Long', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => toggleHexLength(value, budget)),
  }),
  base({
    id: 'DEV-023', name: 'remove-console-log', title: 'Remove console.log Statements', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => removeConsoleLog(value, budget)),
  }),
  base({
    id: 'DEV-024', name: 'sort-imports', title: 'Sort Import Statements', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => sortImports(value, budget)),
  }),
  base({
    id: 'DEV-025', name: 'concat-to-template', title: 'Convert String Concatenation to Template Literal', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => concatToTemplate(value, budget)),
  }),
  base({
    id: 'DEV-026', name: 'curl-to-fetch', title: 'Convert curl Command to fetch', acceptsBlank: false,
    transform: withBudget((value, context, budget) => curlToFetch(value, context.eol, budget)),
  }),
  HTML_TO_JSX,
  base({
    id: 'DEV-028', name: 'semver-bump', title: 'Bump Semantic Version', acceptsBlank: false,
    quickPick: {
      placeHolder: 'Choose the part of the version to raise',
      items: [
        { label: 'patch', description: '1.2.3 → 1.2.4', value: 'patch' },
        { label: 'minor', description: '1.2.3 → 1.3.0', value: 'minor' },
        { label: 'major', description: '1.2.3 → 2.0.0', value: 'major' },
      ],
    },
    transform: withBudget((value, context, budget) => {
      const part = SEMVER_PARTS.find((candidate) => candidate === context.choice);
      if (part === undefined) {
        throw new DevInputError('choose the part of the version to raise: patch, minor or major');
      }
      return semverBump(value, part, budget);
    }),
  }),
  base({
    id: 'DEV-029', name: 'chmod-convert', title: 'Convert chmod Numeric / Symbolic', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => chmodConvert(value, budget)),
  }),
  replaceOf('DEV-030', TO_JS_STRING),
  replaceOf('DEV-031', ESCAPE_REGEX),
  replaceOf('DEV-032', ESCAPE_SQL),
  replaceOf('DEV-033', JSON_TO_TYPESCRIPT),
  replaceOf('DEV-034', SQL_FORMAT),
  replaceOf('DEV-035', HTML_TO_JSX),
];
