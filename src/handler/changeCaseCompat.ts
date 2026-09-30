/**
 * change-case v5 wrapped so that every case command keeps producing exactly the
 * output it produced with change-case v4. This module must not import `vscode`
 * so that it can be unit-tested directly, and it is the only module that may
 * import `change-case` itself.
 *
 * Why the wrapper is needed (change-case v5 differs from v4 in two ways):
 * - Word splitting: v5 splits Unicode-aware (`\p{L}`), so letters such as `é`,
 *   `ß` or Japanese text are kept as part of words, whereas v4 (no-case 3.x)
 *   treats every character other than ASCII letters and digits as a delimiter
 *   and drops it (`café au lait` -> kebab `caf-au-lait` in v4,
 *   `café-au-lait` in v5). `splitV4` below re-implements the v4 rules and is
 *   passed as the `split` option.
 * - Locale: without a `locale` option v5 calls `toLocaleLowerCase(undefined)`,
 *   i.e. the output depends on the host locale (e.g. Turkish `I`). v4 used
 *   `toLowerCase()` / `toUpperCase()`, which `locale: false` reproduces.
 *
 * Both options are always forced by the wrapper; callers can only pass
 * `delimiter` (the only option the case commands use).
 *
 * Bundling: change-case v5 is ESM-only. The extension (`out/main.js`) is built
 * by esbuild with `--bundle --format=cjs`, which inlines change-case, so the
 * shipped extension never `require`s an ES module at run time. The tsc output
 * used by the tests is CommonJS (`module: node20`) and loads change-case via
 * Node's require(esm), which the VS Code test host's Electron supports.
 */
import * as changeCase from 'change-case';

/** The only option callers may pass; `split` and `locale` are always fixed. */
export interface CompatOptions {
  delimiter?: string;
}

// v4 (no-case 3.x) rules. Every pattern is a fixed character class without
// nested quantifiers, so matching is linear in the input length (no ReDoS).
const SPLIT_LOWER_UPPER = /([a-z0-9])([A-Z])/g;
const SPLIT_UPPER_UPPER_LOWER = /([A-Z])([A-Z][a-z])/g;
const STRIP_NON_ALNUM = /[^A-Z0-9]+/gi;
const SEPARATOR = '\0';

/**
 * Splits `value` into words exactly like change-case v4 did: a word boundary is
 * inserted between a lower-case letter/digit and an upper-case letter, and
 * before the last upper-case letter of an acronym followed by a lower-case
 * letter (`XMLHttp` -> `XML`, `Http`); every run of characters other than ASCII
 * letters and digits is a delimiter and is dropped. Returns `[]` when no word
 * is left.
 */
export const splitV4 = (value: string): string[] => {
  const marked = value
    .replace(SPLIT_LOWER_UPPER, `$1${SEPARATOR}$2`)
    .replace(SPLIT_UPPER_UPPER_LOWER, `$1${SEPARATOR}$2`)
    .replace(STRIP_NON_ALNUM, SEPARATOR);
  let start = 0;
  let end = marked.length;
  while (start < end && marked.charAt(start) === SEPARATOR) {
    start++;
  }
  while (end > start && marked.charAt(end - 1) === SEPARATOR) {
    end--;
  }
  return start === end ? [] : marked.slice(start, end).split(SEPARATOR);
};

const v4Options = (options?: CompatOptions): changeCase.Options => ({
  ...(options?.delimiter === undefined ? {} : { delimiter: options.delimiter }),
  split: splitV4,
  locale: false,
});

export const camelCase = (value: string, options?: CompatOptions): string =>
  changeCase.camelCase(value, v4Options(options));
export const capitalCase = (value: string, options?: CompatOptions): string =>
  changeCase.capitalCase(value, v4Options(options));
export const constantCase = (value: string, options?: CompatOptions): string =>
  changeCase.constantCase(value, v4Options(options));
export const dotCase = (value: string, options?: CompatOptions): string =>
  changeCase.dotCase(value, v4Options(options));
/** v4 `paramCase`. */
export const kebabCase = (value: string, options?: CompatOptions): string =>
  changeCase.kebabCase(value, v4Options(options));
export const noCase = (value: string, options?: CompatOptions): string =>
  changeCase.noCase(value, v4Options(options));
export const pascalCase = (value: string, options?: CompatOptions): string =>
  changeCase.pascalCase(value, v4Options(options));
export const pathCase = (value: string, options?: CompatOptions): string =>
  changeCase.pathCase(value, v4Options(options));
export const sentenceCase = (value: string, options?: CompatOptions): string =>
  changeCase.sentenceCase(value, v4Options(options));
export const snakeCase = (value: string, options?: CompatOptions): string =>
  changeCase.snakeCase(value, v4Options(options));
/** v4 `headerCase`. */
export const trainCase = (value: string, options?: CompatOptions): string =>
  changeCase.trainCase(value, v4Options(options));
