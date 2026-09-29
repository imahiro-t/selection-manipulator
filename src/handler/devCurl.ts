/**
 * DEV-026: a curl command line → the equivalent `fetch()` call (vscode-independent).
 *
 * This is only a text conversion: curl is never run, nothing is sent over the network, no file
 * named in the command is read (`-d @file`, `-F name=@file` become TODO comments) and no shell
 * expansion happens (`$VAR`, `$(…)` and `` `…` `` stay as they are written). The command is split
 * into words by a small POSIX-shell-like scanner that is linear in the length of the text.
 */
import { DevInputError, DevOutputBuffer, quoteText } from './devCommon';
import { toJsString } from './devLiterals';

interface ShellWords {
  words: string[];
  /** The unquoted shell operator (`|`, `;`, `&`, `>` …) where the command ended, if any. */
  stoppedAt?: string;
}

const SHELL_OPERATORS = new Set(['|', ';', '&', '<', '>', '(', ')']);

/** The value of an ANSI-C quoted escape (`$'…'`) at `text[i]` (after the `\`) and its length. */
const ansiCEscape = (text: string, i: number): [string, number] => {
  const ch = text[i];
  const simple: Record<string, string> = {
    n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v',
    '\\': '\\', '\'': '\'', '"': '"', '?': '?',
  };
  if (ch in simple) {
    return [simple[ch], 1];
  }
  const hexDigits = (max: number): string => {
    let end = i + 1;
    while (end < text.length && end <= i + max && /[0-9a-fA-F]/.test(text[end])) {
      end++;
    }
    return text.slice(i + 1, end);
  };
  if (ch === 'x') {
    const digits = hexDigits(2);
    return digits === '' ? ['\\x', 1] : [String.fromCharCode(parseInt(digits, 16)), 1 + digits.length];
  }
  if (ch === 'u' || ch === 'U') {
    const digits = hexDigits(ch === 'u' ? 4 : 8);
    const code = digits === '' ? NaN : parseInt(digits, 16);
    return Number.isNaN(code) || code > 0x10ffff ? [`\\${ch}`, 1] : [String.fromCodePoint(code), 1 + digits.length];
  }
  if (ch >= '0' && ch <= '7') {
    let end = i;
    while (end < text.length && end < i + 3 && text[end] >= '0' && text[end] <= '7') {
      end++;
    }
    return [String.fromCharCode(parseInt(text.slice(i, end), 8) & 0xff), end - i];
  }
  return [`\\${ch ?? ''}`, ch === undefined ? 0 : 1];
};

const isLineBreak = (ch: string): boolean => ch === '\n' || ch === '\r';

/** The length of the line break at `i` (`\r\n` = 2), or 0. */
const lineBreakLength = (text: string, i: number): number =>
  text[i] === '\r' && text[i + 1] === '\n' ? 2 : isLineBreak(text[i]) ? 1 : 0;

/**
 * Splits a shell command line into words like a POSIX shell, without any expansion: `'…'`,
 * `"…"` (with its `\` escapes), `$'…'` (ANSI-C escapes), `\` outside quotes, `\` + line break
 * (a line continuation), `#` comments and line breaks as word separators. Stops at an unquoted
 * shell operator.
 */
export const splitShellWords = (text: string): ShellWords => {
  const words: string[] = [];
  let word: string | undefined;
  const end = (): void => {
    if (word !== undefined) {
      words.push(word);
      word = undefined;
    }
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || isLineBreak(ch)) {
      end();
      i++;
    } else if (ch === '\\') {
      const continuation = lineBreakLength(text, i + 1);
      if (continuation > 0) {
        i += 1 + continuation;
      } else {
        word = (word ?? '') + (text[i + 1] ?? '');
        i += 2;
      }
    } else if (ch === '#' && word === undefined) {
      while (i < text.length && !isLineBreak(text[i])) {
        i++;
      }
    } else if (ch === '\'') {
      const close = text.indexOf('\'', i + 1);
      if (close < 0) {
        throw new DevInputError('a \' quote is not closed');
      }
      word = (word ?? '') + text.slice(i + 1, close);
      i = close + 1;
    } else if (ch === '$' && text[i + 1] === '\'') {
      let value = '';
      let j = i + 2;
      for (; j < text.length && text[j] !== '\''; j++) {
        if (text[j] === '\\') {
          const [escaped, length] = ansiCEscape(text, j + 1);
          value += escaped;
          j += length;
        } else {
          value += text[j];
        }
      }
      if (j >= text.length) {
        throw new DevInputError('a $\' quote is not closed');
      }
      word = (word ?? '') + value;
      i = j + 1;
    } else if (ch === '"') {
      let value = '';
      let j = i + 1;
      for (; j < text.length && text[j] !== '"'; j++) {
        if (text[j] === '\\') {
          const continuation = lineBreakLength(text, j + 1);
          if (continuation > 0) {
            j += continuation;
          } else if ('$`"\\'.includes(text[j + 1] ?? '')) {
            value += text[j + 1];
            j++;
          } else {
            value += '\\';
          }
        } else {
          value += text[j];
        }
      }
      if (j >= text.length) {
        throw new DevInputError('a " quote is not closed');
      }
      word = (word ?? '') + value;
      i = j + 1;
    } else if ((ch === '$' && text[i + 1] === '(') || ch === '`') {
      // A command substitution is kept as it is written (never run): up to its closing `)` / `` ` ``.
      let j = i + 1;
      if (ch === '`') {
        j = text.indexOf('`', j);
      } else {
        let depth = 0;
        for (; j < text.length; j++) {
          if (text[j] === '(') {
            depth++;
          } else if (text[j] === ')' && --depth === 0) {
            break;
          }
        }
      }
      if (j < 0 || j >= text.length) {
        throw new DevInputError(`a ${ch === '`' ? '`' : '$('} command substitution is not closed`);
      }
      word = (word ?? '') + text.slice(i, j + 1);
      i = j + 1;
    } else if (SHELL_OPERATORS.has(ch)) {
      end();
      return { words, stoppedAt: ch };
    } else {
      word = (word ?? '') + ch;
      i++;
    }
  }
  end();
  return { words };
};

// ---------------------------------------------------------------------------------------------
// curl options
// ---------------------------------------------------------------------------------------------

/** Short options that take a value, by their long name. */
const SHORT_WITH_VALUE: Record<string, string> = {
  X: '--request', H: '--header', d: '--data', u: '--user', A: '--user-agent', e: '--referer',
  b: '--cookie', F: '--form', o: '--output', m: '--max-time', w: '--write-out', c: '--cookie-jar',
  D: '--dump-header', C: '--continue-at', E: '--cert', K: '--config', P: '--ftp-port', Q: '--quote',
  r: '--range', t: '--telnet-option', T: '--upload-file', U: '--proxy-user', x: '--proxy',
  y: '--speed-time', Y: '--speed-limit', z: '--time-cond',
};
/** Short options without a value, by their long name. */
const SHORT_FLAGS: Record<string, string> = {
  I: '--head', G: '--get', L: '--location', s: '--silent', S: '--show-error', k: '--insecure',
  v: '--verbose', i: '--include', f: '--fail', g: '--globoff', N: '--no-buffer', q: '--disable',
  '#': '--progress-bar', '0': '--http1.0', '4': '--ipv4', '6': '--ipv6', j: '--junk-session-cookies',
  O: '--remote-name', J: '--remote-header-name', R: '--remote-time', Z: '--parallel',
};
/** Long options this conversion uses, all with a value. */
const USED_WITH_VALUE = new Set([
  '--request', '--header', '--data', '--data-ascii', '--data-raw', '--data-binary', '--data-urlencode',
  '--json', '--user', '--user-agent', '--referer', '--cookie', '--form', '--form-string', '--url',
  '--oauth2-bearer',
]);
/** Options about the output, the connection or retries: they do not change the request and are dropped quietly. */
const QUIET_WITH_VALUE = new Set([
  '--output', '--max-time', '--connect-timeout', '--write-out', '--cookie-jar', '--dump-header',
  '--retry', '--retry-delay', '--retry-max-time', '--limit-rate', '--max-redirs', '--speed-time',
  '--speed-limit', '--stderr', '--trace', '--trace-ascii', '--keepalive-time',
]);
const QUIET_FLAGS = new Set([
  '--location', '--silent', '--show-error', '--insecure', '--verbose', '--include', '--fail',
  '--fail-with-body', '--globoff', '--no-buffer', '--compressed', '--no-progress-meter',
  '--progress-bar', '--location-trusted', '--http1.0', '--http1.1', '--http2', '--http2-prior-knowledge',
  '--http3', '--ipv4', '--ipv6', '--tcp-nodelay', '--no-keepalive', '--remote-name', '--remote-name-all',
  '--remote-header-name', '--remote-time', '--create-dirs', '--disable', '--junk-session-cookies',
  '--path-as-is', '--raw', '--no-sessionid', '--parallel',
]);
/** Other long options known to take a value: they are ignored and listed in a comment. */
const OTHER_WITH_VALUE = new Set([
  '--continue-at', '--cert', '--key', '--cacert', '--capath', '--config', '--ftp-port', '--quote',
  '--range', '--telnet-option', '--upload-file', '--proxy-user', '--proxy', '--time-cond',
  '--resolve', '--interface', '--variable', '--connect-to', '--cert-type', '--key-type', '--pass',
  '--ciphers', '--noproxy', '--preproxy', '--proxy-header', '--local-port', '--dns-servers',
  '--aws-sigv4', '--unix-socket', '--abstract-unix-socket', '--netrc-file', '--login-options',
]);

interface Header {
  name: string;
  value: string;
}

interface Request {
  urls: string[];
  method?: string;
  head: boolean;
  get: boolean;
  headers: Header[];
  /** Header names removed with `-H 'Name:'` (lower case). */
  removedHeaders: Set<string>;
  data: string[];
  json: string[];
  form: [string, string][];
  /** Whether there was a `-F` / `--form-string`, even when all its fields are files (TODO comments). */
  hasForm: boolean;
  todos: string[];
  ignored: string[];
}

const fileTodo = (option: string, file: string): string =>
  `TODO: curl ${option} reads ${file === '-' ? 'the standard input' : `the file ${toJsString(file)}`}; this conversion does not read files`;

const addHeader = (request: Request, line: string): void => {
  if (line.startsWith('@')) {
    request.todos.push(fileTodo('-H', line.slice(1)));
    return;
  }
  const colon = line.indexOf(':');
  const semicolon = line.indexOf(';');
  if (colon > 0 && (semicolon < 0 || colon < semicolon)) {
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (value === '') {
      request.removedHeaders.add(name.toLowerCase());
      return;
    }
    request.headers.push({ name, value });
    return;
  }
  if (semicolon > 0 && line.slice(semicolon + 1).trim() === '') {
    // `-H 'Name;'` sends the header with an empty value.
    request.headers.push({ name: line.slice(0, semicolon).trim(), value: '' });
    return;
  }
  throw new DevInputError(`the header ${quoteText(line)} has no "Name: value" form`);
};

/** `--data-urlencode` value → the encoded part of the body. */
const urlencodedPart = (request: Request, value: string): string | undefined => {
  const equals = value.indexOf('=');
  const at = value.indexOf('@');
  if (equals >= 0 && (at < 0 || equals < at)) {
    const name = value.slice(0, equals);
    const content = encodeURIComponent(value.slice(equals + 1));
    return name === '' ? content : `${name}=${content}`;
  }
  if (at >= 0) {
    request.todos.push(fileTodo('--data-urlencode', value.slice(at + 1)));
    return undefined;
  }
  return encodeURIComponent(value);
};

const applyOption = (request: Request, option: string, value: string): void => {
  switch (option) {
    case '--request':
      request.method = value;
      return;
    case '--header':
      addHeader(request, value);
      return;
    case '--data':
    case '--data-ascii':
    case '--data-binary':
      if (value.startsWith('@')) {
        request.todos.push(fileTodo(option, value.slice(1)));
      } else {
        request.data.push(value);
      }
      return;
    case '--data-raw':
      request.data.push(value);
      return;
    case '--data-urlencode': {
      const part = urlencodedPart(request, value);
      if (part !== undefined) {
        request.data.push(part);
      }
      return;
    }
    case '--json':
      if (value.startsWith('@')) {
        request.todos.push(fileTodo(option, value.slice(1)));
      } else {
        request.json.push(value);
      }
      return;
    case '--user': {
      const credentials = value.includes(':') ? value : `${value}:`;
      if (!value.includes(':')) {
        request.todos.push('TODO: curl asks for the password of --user; add it after the ":" before encoding');
      }
      request.headers.push({ name: 'Authorization', value: `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}` });
      return;
    }
    case '--oauth2-bearer':
      request.headers.push({ name: 'Authorization', value: `Bearer ${value}` });
      return;
    case '--user-agent':
      request.headers.push({ name: 'User-Agent', value });
      return;
    case '--referer':
      request.headers.push({ name: 'Referer', value: value.endsWith(';auto') ? value.slice(0, -';auto'.length) : value });
      return;
    case '--cookie':
      if (value.includes('=')) {
        request.headers.push({ name: 'Cookie', value });
      } else {
        request.todos.push(fileTodo(option, value));
      }
      return;
    case '--form':
    case '--form-string': {
      const equals = value.indexOf('=');
      if (equals <= 0) {
        throw new DevInputError(`the form field ${quoteText(value)} has no "name=value" form`);
      }
      const name = value.slice(0, equals);
      const content = value.slice(equals + 1);
      if (option === '--form' && (content.startsWith('@') || content.startsWith('<'))) {
        const file = content.slice(1).split(';')[0];
        request.todos.push(`TODO: formData.append(${toJsString(name)}, …) — curl ${option} reads the file ${toJsString(file)}; this conversion does not read files`);
        request.hasForm = true;
      } else {
        request.hasForm = true;
        request.form.push([name, content]);
      }
      return;
    }
    case '--url':
      request.urls.push(value);
      return;
    default:
      return;
  }
};

/** Reads the options and URLs after `curl`. */
const parseCurl = (words: readonly string[]): Request => {
  const request: Request = {
    urls: [], head: false, get: false, headers: [], removedHeaders: new Set(), data: [], json: [], form: [], hasForm: false,
    todos: [], ignored: [],
  };
  const takeValue = (option: string, index: number): string => {
    if (index >= words.length) {
      throw new DevInputError(`the option ${option} has no value`);
    }
    return words[index];
  };
  const flag = (option: string): void => {
    if (option === '--head') {
      request.head = true;
    } else if (option === '--get') {
      request.get = true;
    } else if (!QUIET_FLAGS.has(option)) {
      request.ignored.push(option);
    }
  };
  const withValue = (option: string, value: string): void => {
    if (USED_WITH_VALUE.has(option)) {
      applyOption(request, option, value);
    } else if (!QUIET_WITH_VALUE.has(option)) {
      request.ignored.push(option);
    }
  };
  let options = true;
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (!options || !word.startsWith('-') || word === '-') {
      request.urls.push(word);
    } else if (word === '--') {
      options = false;
    } else if (word.startsWith('--')) {
      if (USED_WITH_VALUE.has(word) || QUIET_WITH_VALUE.has(word) || OTHER_WITH_VALUE.has(word)) {
        withValue(word, takeValue(word, i + 1));
        i++;
      } else {
        flag(word);
      }
    } else {
      // A cluster of short options (`-sSL`, `-XPOST`, `-H 'a: b'`).
      for (let j = 1; j < word.length; j++) {
        const letter = word[j];
        const long = SHORT_WITH_VALUE[letter];
        if (long !== undefined) {
          const rest = word.slice(j + 1);
          if (rest !== '') {
            withValue(long, rest);
          } else {
            withValue(long, takeValue(`-${letter}`, i + 1));
            i++;
          }
          break;
        }
        const flagName = SHORT_FLAGS[letter];
        if (flagName !== undefined) {
          flag(flagName);
        } else {
          request.ignored.push(`-${letter}`);
        }
      }
    }
  }
  return request;
};

/** The headers with the same name (ignoring case) joined like `Headers.append` does. */
const mergedHeaders = (headers: readonly Header[]): Header[] => {
  const byName = new Map<string, Header>();
  for (const header of headers) {
    const key = header.name.toLowerCase();
    const existing = byName.get(key);
    if (existing === undefined) {
      byName.set(key, { ...header });
    } else {
      existing.value = `${existing.value}${key === 'cookie' ? '; ' : ', '}${header.value}`;
    }
  }
  return [...byName.values()];
};

/**
 * DEV-026: converts a `curl …` command line (a leading `$ ` prompt and `\` line continuations are
 * allowed) into a `fetch()` call with the method, headers and body that curl would send:
 * `-X`, `-H`, `-d` / `--data-raw` / `--data-binary` / `--data-urlencode` (joined with `&`, sent as
 * `application/x-www-form-urlencoded` like curl does), `--json`, `-F` (a `FormData`), `-u` (Basic
 * authorization), `-A`, `-e`, `-b`, `-I`, `-G`, `--url`. Options about the output or the
 * connection are dropped; any other option is listed in an `// Ignored curl options:` comment.
 * Strings are written as single-quoted JavaScript literals (DEV-001).
 */
export const curlToFetch = (text: string, eol: string, budget: number): string => {
  const source = text.trimStart().replace(/^\$[ \t]+/, '');
  const { words, stoppedAt } = splitShellWords(source);
  if (words.length === 0 || words[0] !== 'curl') {
    throw new DevInputError('the selection is not a curl command (it must start with "curl")');
  }
  const request = parseCurl(words);
  if (request.urls.length !== 1) {
    throw new DevInputError(request.urls.length === 0
      ? 'the curl command has no URL'
      : `the curl command has ${request.urls.length} URLs (${request.urls.map(quoteText).join(', ')}); select a command with one URL`);
  }
  const form = request.hasForm;
  if (form && (request.data.length > 0 || request.json.length > 0)) {
    throw new DevInputError('the curl command mixes -F (a form) with -d / --json (a body); curl does not allow that either');
  }
  if (request.data.length > 0 && request.json.length > 0) {
    throw new DevInputError('the curl command mixes -d with --json; select a command with one kind of body');
  }
  let url = request.urls[0];
  let body: string | undefined;
  const headers = [...request.headers];
  const hasHeader = (name: string): boolean =>
    headers.some((header) => header.name.toLowerCase() === name) || request.removedHeaders.has(name);
  if (request.get) {
    if (request.data.length > 0) {
      url += (url.includes('?') ? '&' : '?') + request.data.join('&');
    }
  } else if (request.data.length > 0) {
    body = request.data.join('&');
    if (!hasHeader('content-type')) {
      headers.push({ name: 'Content-Type', value: 'application/x-www-form-urlencoded' });
    }
  } else if (request.json.length > 0) {
    body = request.json.join('');
    if (!hasHeader('content-type')) {
      headers.push({ name: 'Content-Type', value: 'application/json' });
    }
    if (!hasHeader('accept')) {
      headers.push({ name: 'Accept', value: 'application/json' });
    }
  }
  const sendsBody = !request.get && (request.data.length > 0 || request.json.length > 0 || form
    || request.todos.some((todo) => todo.includes('--data') || todo.includes('--json')));
  const method = request.method ?? (request.head ? 'HEAD' : request.get ? 'GET' : sendsBody ? 'POST' : 'GET');

  const out = new DevOutputBuffer(budget);
  const line = (value: string): void => out.push(value + eol);
  if (request.ignored.length > 0) {
    line(`// Ignored curl options: ${[...new Set(request.ignored)].join(', ')}`);
  }
  if (stoppedAt !== undefined) {
    line(`// Ignored the rest of the shell command after ${toJsString(stoppedAt)}`);
  }
  request.todos.forEach((todo) => line(`// ${todo}`));
  if (form) {
    line('const formData = new FormData();');
    request.form.forEach(([name, value]) => line(`formData.append(${toJsString(name)}, ${toJsString(value)});`));
  }
  const options: string[] = [];
  if (method !== 'GET') {
    options.push(`  method: ${toJsString(method)},`);
  }
  const merged = mergedHeaders(headers);
  if (merged.length > 0) {
    options.push('  headers: {');
    merged.forEach((header) => options.push(`    ${toJsString(header.name)}: ${toJsString(header.value)},`));
    options.push('  },');
  }
  if (form && !request.get) {
    options.push('  body: formData,');
  } else if (body !== undefined) {
    options.push(`  body: ${toJsString(body)},`);
  }
  if (options.length === 0) {
    out.push(`fetch(${toJsString(url)});`);
  } else {
    line(`fetch(${toJsString(url)}, {`);
    options.forEach(line);
    out.push('});');
  }
  return out.join();
};
