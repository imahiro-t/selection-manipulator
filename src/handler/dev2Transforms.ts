/**
 * Pure (vscode-independent) command table of the DEVX-001..023 extended developer commands
 * (group DEV2): JSON to Rust / Kotlin / C# / Zod / Swift types, SQL keywords in lower case, OKLCH,
 * contrast ratio and inverted colors, CSS declaration tools, comment removal, C# / Rust / shell
 * literals, HTTP status and MIME lookups from fixed tables, UUID, CIDR, IPv6 and IPv4 tools.
 *
 * They run through the DEV command handler (devCommandHandler.ts): each selection is converted on
 * its own and the results open in a new read-only editor. Only local processing: no network, files
 * or processes, no `eval` / `new Function`, no new dependency. Generated code, SQL and shell texts
 * are only built as strings, never compiled or run.
 */
import { removeJsComments, toCSharpVerbatimString, toHeredoc, toRustRawString } from './dev2Code';
import { colorContrastRatio, colorInvert, hexToOklch } from './dev2Color';
import { cssSortProperties, cssToJsObject, jsObjectToCss } from './dev2Css';
import { jsonToCSharpClass, jsonToKotlinDataClass, jsonToRustStruct, jsonToSwiftCodable, jsonToZod } from './dev2JsonTypes';
import { httpStatusDescribe, mimeTypeLookup } from './dev2Lookup';
import { cidrInfo, ipToInteger, ipv6Compress, ipv6Expand, uuidNormalize } from './dev2Network';
import { sqlLowercaseKeywords } from './devSql';
import { base, DevCommandEntry, text, withBudget } from './devTransforms';

/** The commands in the order of the showcase data (scripts/showcase-data/DEVX.json). */
export const DEV2_COMMAND_ENTRIES: readonly DevCommandEntry[] = [
  base({
    id: 'DEVX-001', name: 'json-to-rust-struct', title: 'Convert JSON to Rust Struct (serde)', acceptsBlank: false,
    transform: withBudget((value, context, budget) => jsonToRustStruct(value, context.eol, budget)),
  }),
  base({
    id: 'DEVX-002', name: 'json-to-kotlin-data-class', title: 'Convert JSON to Kotlin Data Class', acceptsBlank: false,
    transform: withBudget((value, context, budget) => jsonToKotlinDataClass(value, context.eol, budget)),
  }),
  base({
    id: 'DEVX-003', name: 'json-to-csharp-class', title: 'Convert JSON to C# Class', acceptsBlank: false,
    transform: withBudget((value, context, budget) => jsonToCSharpClass(value, context.eol, budget)),
  }),
  base({
    id: 'DEVX-004', name: 'json-to-zod', title: 'Convert JSON to Zod Schema', acceptsBlank: false,
    transform: withBudget((value, context, budget) => jsonToZod(value, context.eol, budget)),
  }),
  base({
    id: 'DEVX-005', name: 'json-to-swift-codable', title: 'Convert JSON to Swift Codable', acceptsBlank: false,
    transform: withBudget((value, context, budget) => jsonToSwiftCodable(value, context.eol, budget)),
  }),
  base({
    id: 'DEVX-006', name: 'sql-lowercase-keywords', title: 'Lowercase SQL Keywords', acceptsBlank: false,
    transform: text(sqlLowercaseKeywords),
  }),
  base({
    id: 'DEVX-007', name: 'hex-to-oklch', title: 'Convert Hex Color to OKLCH', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => hexToOklch(value, budget)),
  }),
  base({
    id: 'DEVX-008', name: 'color-contrast-ratio', title: 'Show WCAG Contrast Ratio', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => colorContrastRatio(value, budget)),
  }),
  base({
    id: 'DEVX-009', name: 'color-invert', title: 'Invert Hex Color', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => colorInvert(value, budget)),
  }),
  base({
    id: 'DEVX-010', name: 'css-sort-properties', title: 'Sort CSS Declarations', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => cssSortProperties(value, budget)),
  }),
  base({
    id: 'DEVX-011', name: 'css-to-js-object', title: 'Convert CSS Declarations to JS Style Object', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => cssToJsObject(value, budget)),
  }),
  base({
    id: 'DEVX-012', name: 'js-object-to-css', title: 'Convert JS Style Object to CSS Declarations', acceptsBlank: false,
    transform: withBudget((value, context, budget) => jsObjectToCss(value, context.eol, budget)),
  }),
  base({
    id: 'DEVX-013', name: 'remove-comments-js', title: 'Remove JS / TS Comments', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => removeJsComments(value, budget)),
  }),
  base({
    id: 'DEVX-014', name: 'to-csharp-verbatim-string', title: 'Convert to C# Verbatim String', acceptsBlank: true,
    transform: text(toCSharpVerbatimString),
  }),
  base({
    id: 'DEVX-015', name: 'to-rust-raw-string', title: 'Convert to Rust Raw String', acceptsBlank: true,
    transform: text(toRustRawString),
  }),
  base({
    id: 'DEVX-016', name: 'to-heredoc', title: 'Convert to Shell Here-document', acceptsBlank: true,
    transform: withBudget((value, _context, budget) => toHeredoc(value, budget)),
  }),
  base({
    id: 'DEVX-017', name: 'http-status-describe', title: 'Describe HTTP Status Code', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => httpStatusDescribe(value, budget)),
  }),
  base({
    id: 'DEVX-018', name: 'mime-type-lookup', title: 'Look Up MIME Type by Extension', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => mimeTypeLookup(value, budget)),
  }),
  base({
    id: 'DEVX-019', name: 'uuid-normalize', title: 'Normalize UUID Format', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => uuidNormalize(value, budget)),
  }),
  base({
    id: 'DEVX-020', name: 'cidr-info', title: 'Show CIDR Range Information', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => cidrInfo(value, budget)),
  }),
  base({
    id: 'DEVX-021', name: 'ipv6-expand', title: 'Expand IPv6 Address', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => ipv6Expand(value, budget)),
  }),
  base({
    id: 'DEVX-022', name: 'ipv6-compress', title: 'Compress IPv6 Address', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => ipv6Compress(value, budget)),
  }),
  base({
    id: 'DEVX-023', name: 'ip-to-integer', title: 'Convert IPv4 to Integer and Back', acceptsBlank: false,
    transform: withBudget((value, _context, budget) => ipToInteger(value, budget)),
  }),
];
