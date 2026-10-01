/**
 * DEVX-017..018: HTTP status reason phrases and MIME types by extension, from fixed tables in this
 * module (vscode-independent).
 *
 * No Node.js module is consulted (`node:http`'s STATUS_CODES is deliberately not used, so the
 * result does not change with the Node.js version of VS Code), no file is read (a file name is only
 * text) and unknown values are errors rather than guesses. Each line is converted on its own.
 */
import { convertEachLine } from './devCommon';

// ---------------------------------------------------------------------------------------------
// DEVX-017 HTTP status
// ---------------------------------------------------------------------------------------------

/**
 * The codes of the IANA HTTP Status Code Registry that have a reason phrase (as RFC 9110 and the
 * other current RFCs write it; the provisional 104 is left out), and 418 I'm a teapot (RFC 2324),
 * which IANA reserves as "(Unused)" but which is widely used. 306 "(Unused)" and the unassigned
 * codes are not in the table.
 */
export const HTTP_STATUS_PHRASES: ReadonlyMap<number, string> = new Map([
  [100, 'Continue'],
  [101, 'Switching Protocols'],
  [102, 'Processing'],
  [103, 'Early Hints'],
  [200, 'OK'],
  [201, 'Created'],
  [202, 'Accepted'],
  [203, 'Non-Authoritative Information'],
  [204, 'No Content'],
  [205, 'Reset Content'],
  [206, 'Partial Content'],
  [207, 'Multi-Status'],
  [208, 'Already Reported'],
  [226, 'IM Used'],
  [300, 'Multiple Choices'],
  [301, 'Moved Permanently'],
  [302, 'Found'],
  [303, 'See Other'],
  [304, 'Not Modified'],
  [305, 'Use Proxy'],
  [307, 'Temporary Redirect'],
  [308, 'Permanent Redirect'],
  [400, 'Bad Request'],
  [401, 'Unauthorized'],
  [402, 'Payment Required'],
  [403, 'Forbidden'],
  [404, 'Not Found'],
  [405, 'Method Not Allowed'],
  [406, 'Not Acceptable'],
  [407, 'Proxy Authentication Required'],
  [408, 'Request Timeout'],
  [409, 'Conflict'],
  [410, 'Gone'],
  [411, 'Length Required'],
  [412, 'Precondition Failed'],
  [413, 'Content Too Large'],
  [414, 'URI Too Long'],
  [415, 'Unsupported Media Type'],
  [416, 'Range Not Satisfiable'],
  [417, 'Expectation Failed'],
  [418, 'I\'m a teapot'],
  [421, 'Misdirected Request'],
  [422, 'Unprocessable Content'],
  [423, 'Locked'],
  [424, 'Failed Dependency'],
  [425, 'Too Early'],
  [426, 'Upgrade Required'],
  [428, 'Precondition Required'],
  [429, 'Too Many Requests'],
  [431, 'Request Header Fields Too Large'],
  [451, 'Unavailable For Legal Reasons'],
  [500, 'Internal Server Error'],
  [501, 'Not Implemented'],
  [502, 'Bad Gateway'],
  [503, 'Service Unavailable'],
  [504, 'Gateway Timeout'],
  [505, 'HTTP Version Not Supported'],
  [506, 'Variant Also Negotiates'],
  [507, 'Insufficient Storage'],
  [508, 'Loop Detected'],
  [510, 'Not Extended'],
  [511, 'Network Authentication Required'],
]);

const STATUS_CODE = /^[1-5][0-9]{2}$/;

const describeStatus = (value: string): string | undefined => {
  if (!STATUS_CODE.test(value)) {
    return undefined;
  }
  const phrase = HTTP_STATUS_PHRASES.get(Number(value));
  return phrase === undefined ? undefined : `${value} ${phrase}`;
};

/**
 * DEVX-017: a three-digit HTTP status code → the code and its reason phrase (`404` → `404 Not
 * Found`). Codes without a registered reason phrase (306, 509, …) are errors.
 */
export const httpStatusDescribe = (text: string, budget: number): string =>
  convertEachLine(text, budget, describeStatus, 'an HTTP status code with a registered reason phrase (e.g. 404)');

// ---------------------------------------------------------------------------------------------
// DEVX-018 MIME type
// ---------------------------------------------------------------------------------------------

/** Common file extensions of the web and their IANA media types (lower-case extensions). */
export const MIME_TYPES: ReadonlyMap<string, string> = new Map([
  // Text and code
  ['txt', 'text/plain'],
  ['text', 'text/plain'],
  ['log', 'text/plain'],
  ['html', 'text/html'],
  ['htm', 'text/html'],
  ['css', 'text/css'],
  ['csv', 'text/csv'],
  ['tsv', 'text/tab-separated-values'],
  ['md', 'text/markdown'],
  ['markdown', 'text/markdown'],
  ['ics', 'text/calendar'],
  ['vcf', 'text/vcard'],
  ['js', 'text/javascript'],
  ['mjs', 'text/javascript'],
  ['cjs', 'text/javascript'],
  ['xml', 'application/xml'],
  ['xsl', 'application/xslt+xml'],
  ['xslt', 'application/xslt+xml'],
  ['xhtml', 'application/xhtml+xml'],
  ['rss', 'application/rss+xml'],
  ['atom', 'application/atom+xml'],
  ['svg', 'image/svg+xml'],
  ['json', 'application/json'],
  ['map', 'application/json'],
  ['jsonld', 'application/ld+json'],
  ['geojson', 'application/geo+json'],
  ['webmanifest', 'application/manifest+json'],
  ['yaml', 'application/yaml'],
  ['yml', 'application/yaml'],
  ['toml', 'application/toml'],
  ['wasm', 'application/wasm'],
  ['sql', 'application/sql'],
  ['rtf', 'application/rtf'],
  // Documents
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['xls', 'application/vnd.ms-excel'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['ppt', 'application/vnd.ms-powerpoint'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['odt', 'application/vnd.oasis.opendocument.text'],
  ['ods', 'application/vnd.oasis.opendocument.spreadsheet'],
  ['odp', 'application/vnd.oasis.opendocument.presentation'],
  ['epub', 'application/epub+zip'],
  // Archives and binaries
  ['zip', 'application/zip'],
  ['gz', 'application/gzip'],
  ['tgz', 'application/gzip'],
  ['bz2', 'application/x-bzip2'],
  ['xz', 'application/x-xz'],
  ['zst', 'application/zstd'],
  ['7z', 'application/x-7z-compressed'],
  ['rar', 'application/vnd.rar'],
  ['tar', 'application/x-tar'],
  ['jar', 'application/java-archive'],
  ['bin', 'application/octet-stream'],
  ['exe', 'application/octet-stream'],
  ['dll', 'application/octet-stream'],
  ['iso', 'application/octet-stream'],
  ['dmg', 'application/octet-stream'],
  ['apk', 'application/vnd.android.package-archive'],
  ['swf', 'application/x-shockwave-flash'],
  ['ps', 'application/postscript'],
  ['eps', 'application/postscript'],
  ['ai', 'application/postscript'],
  // Images
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['jpe', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['avif', 'image/avif'],
  ['apng', 'image/apng'],
  ['bmp', 'image/bmp'],
  ['ico', 'image/vnd.microsoft.icon'],
  ['tif', 'image/tiff'],
  ['tiff', 'image/tiff'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['jxl', 'image/jxl'],
  ['psd', 'image/vnd.adobe.photoshop'],
  // Audio
  ['mp3', 'audio/mpeg'],
  ['wav', 'audio/wav'],
  ['ogg', 'audio/ogg'],
  ['oga', 'audio/ogg'],
  ['opus', 'audio/opus'],
  ['flac', 'audio/flac'],
  ['aac', 'audio/aac'],
  ['m4a', 'audio/mp4'],
  ['weba', 'audio/webm'],
  ['mid', 'audio/midi'],
  ['midi', 'audio/midi'],
  // Video
  ['mp4', 'video/mp4'],
  ['m4v', 'video/mp4'],
  ['webm', 'video/webm'],
  ['ogv', 'video/ogg'],
  ['mov', 'video/quicktime'],
  ['avi', 'video/x-msvideo'],
  ['mkv', 'video/x-matroska'],
  ['mpeg', 'video/mpeg'],
  ['mpg', 'video/mpeg'],
  ['ts', 'video/mp2t'],
  ['3gp', 'video/3gpp'],
  // Fonts
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['ttf', 'font/ttf'],
  ['otf', 'font/otf'],
  ['eot', 'application/vnd.ms-fontobject'],
]);

const EXTENSION = /^[a-z0-9]+$/;

const lookupMime = (value: string): string | undefined => {
  const name = value.slice(Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1);
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (!EXTENSION.test(extension)) {
    return undefined;
  }
  return MIME_TYPES.get(extension);
};

/**
 * DEVX-018: an extension (`pdf`, `.pdf`), a file name or a path (the part after the last `/` or
 * `\`, then after its last `.`) → its MIME type from the table (`report.pdf` → `application/pdf`),
 * ignoring case. The file is not looked at. An unknown extension is an error.
 */
export const mimeTypeLookup = (text: string, budget: number): string =>
  convertEachLine(text, budget, lookupMime, 'a file name or extension with a known MIME type (e.g. report.pdf)');
