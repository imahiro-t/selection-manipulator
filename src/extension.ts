import * as vscode from 'vscode';
import { extractHandler } from './handler/extractHandler';
import { extractLineHandler } from './handler/extractLineHandler';
import { extractLineByLengthHandler } from './handler/extractLineByLengthHandler';
import { reverseHandler } from './handler/reverseHandler';
import { shuffleHandler } from './handler/shuffleHandler';
import { sortHandler } from './handler/sortHandler';
import { sortLineHandler } from './handler/sortLineHandler';
import { uniqueHandler } from './handler/uniqueHandler';
import { countOccurrencesHandler } from './handler/countOccurrencesHandler';
import { calculationHandler } from './handler/calculationHandler';
import { calcDateHandler } from './handler/calcDateHandler';
import { jsonHandler } from './handler/jsonHandler';
import { regexpHandler } from './handler/regexpHandler';
import { base64Handler } from './handler/base64Handler';
import { xmlHandler } from './handler/xmlHandler';
import { multiSelectionHandler } from './handler/multiSelectionHandler';
import { countUpListHandler } from './handler/countUpListHandler';
import { zeroPaddingHandler } from './handler/zeroPaddingHandler';
import { incrementFromHandler, incrementFromInputHandler } from './handler/incrementFromHandler';
import { decrementToHandler, decrementToInputHandler } from './handler/decrementToHandler';
import { incrementByInputHandler, incrementByHandler } from './handler/incrementByHandler';
import { decrementByInputHandler, decrementByHandler } from './handler/decrementByHandler';
import { caseHandler } from './handler/caseHandler';
import { showCommandsHandler } from './handler/showCommandsHandler';
import { dnsHandler } from './handler/dnsHandler';
import { urlHandler } from './handler/urlHandler';
import { jwtHandler } from './handler/jwtHandler';
import { samlHandler } from './handler/samlHandler';
import { whoisHandler } from './handler/whoisHandler';
import { harToMermaidHandler } from './handler/harToMermaidHandler';
import { x509CertificateHandler } from './handler/x509CertificateHandler';
import { cryptoHandler } from './handler/cryptoHandler';
import { hmacHandler } from './handler/hmacHandler';
import { removeCursorHandler } from './handler/removeCursorHandler';
import { removeCharacterFromEachSideHandler } from './handler/removeCharacterFromEachSideHandler';
import { geoIpHandler } from './handler/geoIpHandler';
import { clientCredentialsFlowHandler } from './handler/clientCredentialsFlowHandler';
import { aesHandler } from './handler/aesHandler';
import { randomHandler } from './handler/randomHandler';
import { escapeHandler } from './handler/escapeHandler';
import { asciiArtHandler } from './handler/asciiArtHandler';
import { dataExtractionHandler } from './handler/dataExtractionHandler';
import { textCleanupHandler } from './handler/textCleanupHandler';
import { diacriticHandler } from './handler/diacriticHandler';
import { mathHandler } from './handler/mathHandler';
import { csvHandler } from './handler/csvHandler';
import { dataStructHandler } from './handler/dataStructHandler';
import { unitConvertHandler } from './handler/unitConvertHandler';
import { encloseHandler } from './handler/encloseHandler';
import { markdownHandler } from './handler/markdownHandler';
import { insertDateHandler } from './handler/insertDateHandler';
import {
  jsonToYamlHandler,
  yamlToJsonHandler,
  hexToRgbHandler,
  rgbToHexHandler,
  toggleQuotesHandler,
  hexToDecimalHandler,
  decimalToHexHandler,
} from './handler/programmaticHandler';
import {
  fullWidthToHalfWidthHandler,
  halfWidthToFullWidthHandler,
  hiraganaToKatakanaHandler,
  katakanaToHiraganaHandler,
} from './handler/japaneseHandler';
import { ResultProvider } from './provider/resultProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.show-commands', showCommandsHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.multi-selection', multiSelectionHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract', extractHandler(true, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.clipboard', extractHandler(true, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.exclude-blank-rows', extractHandler(false, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.exclude-blank-rows.clipboard', extractHandler(false, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.email', dataExtractionHandler('email', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.email.replace', dataExtractionHandler('email', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.url', dataExtractionHandler('url', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.url.replace', dataExtractionHandler('url', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.ip', dataExtractionHandler('ip', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.ip.replace', dataExtractionHandler('ip', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract-line', extractLineHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract-line.clipboard', extractLineHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.line-by-length.equal', extractLineByLengthHandler('equal', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.line-by-length.equal.clipboard', extractLineByLengthHandler('equal', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.line-by-length.less', extractLineByLengthHandler('less', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.line-by-length.less.clipboard', extractLineByLengthHandler('less', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.line-by-length.greater', extractLineByLengthHandler('greater', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.line-by-length.greater.clipboard', extractLineByLengthHandler('greater', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.line-by-length.range', extractLineByLengthHandler('range', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.extract.line-by-length.range.clipboard', extractLineByLengthHandler('range', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.reverse', reverseHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.reverse.clipboard', reverseHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.shuffle', shuffleHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.shuffle.clipboard', shuffleHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.string.ascending', sortHandler('string', true, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.string.ascending.clipboard', sortHandler('string', true, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.string.descending', sortHandler('string', false, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.string.descending.clipboard', sortHandler('string', false, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.number.ascending', sortHandler('number', true, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.number.ascending.clipboard', sortHandler('number', true, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.number.descending', sortHandler('number', false, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort.number.descending.clipboard', sortHandler('number', false, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.string.ascending', sortLineHandler('string', true, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.string.ascending.clipboard', sortLineHandler('string', true, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.string.descending', sortLineHandler('string', false, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.string.descending.clipboard', sortLineHandler('string', false, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.number.ascending', sortLineHandler('number', true, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.number.ascending.clipboard', sortLineHandler('number', true, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.number.descending', sortLineHandler('number', false, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.number.descending.clipboard', sortLineHandler('number', false, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.occurrence.ascending', sortLineHandler('occurrence', true, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.occurrence.ascending.clipboard', sortLineHandler('occurrence', true, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.occurrence.descending', sortLineHandler('occurrence', false, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.occurrence.descending.clipboard', sortLineHandler('occurrence', false, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.length.ascending', sortLineHandler('length', true, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.length.ascending.clipboard', sortLineHandler('length', true, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.length.descending', sortLineHandler('length', false, false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.sort-line.length.descending.clipboard', sortLineHandler('length', false, true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.unique', uniqueHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.unique.clipboard', uniqueHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.count-occurrences.count', countOccurrencesHandler('count')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.count-occurrences.word', countOccurrencesHandler('word')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.calculation', calculationHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.calculation.date', calcDateHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.format', jsonHandler('format', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.minify', jsonHandler('minify', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.parse', jsonHandler('parse', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.stringify', jsonHandler('stringify', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.format.replace', jsonHandler('format', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.minify.replace', jsonHandler('minify', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.parse.replace', jsonHandler('parse', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.stringify.replace', jsonHandler('stringify', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.flatten', jsonHandler('flatten', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.flatten.replace', jsonHandler('flatten', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.unflatten', jsonHandler('unflatten', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.json.unflatten.replace', jsonHandler('unflatten', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.regex.g', regexpHandler('g')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.regex.gi', regexpHandler('gi')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.encode', base64Handler('encode', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.decode', base64Handler('decode', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.deflate', base64Handler('deflate', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.unzip', base64Handler('inflate', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.encode.replace', base64Handler('encode', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.decode.replace', base64Handler('decode', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.deflate.replace', base64Handler('deflate', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.base64.unzip.replace', base64Handler('inflate', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.xml.format', xmlHandler('format', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.xml.minify', xmlHandler('minify', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.xml.to-json', xmlHandler('to-json', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.xml.format.replace', xmlHandler('format', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.xml.minify.replace', xmlHandler('minify', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.xml.to-json.replace', xmlHandler('to-json', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.count-up-list', countUpListHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.zero-padding', zeroPaddingHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.increment-from-1', incrementFromHandler(1)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.increment-from-n', incrementFromInputHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.decrement-to-1', decrementToHandler(1)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.decrement-to-n', decrementToInputHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.increment-by-1', incrementByHandler(1)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.increment-by-n', incrementByInputHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.decrement-by-1', decrementByHandler(1)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.decrement-by-n', decrementByInputHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.camel', caseHandler('camel')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.capital', caseHandler('capital')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.constant', caseHandler('constant')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.dot', caseHandler('dot')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.kebab', caseHandler('kebab')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.no', caseHandler('no')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.pascal', caseHandler('pascal')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.path', caseHandler('path')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.sentence', caseHandler('sentence')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.snake', caseHandler('snake')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.train', caseHandler('train')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.upper', caseHandler('upper')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.lower', caseHandler('lower')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.title-smart', caseHandler('title-smart')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.spongebob', caseHandler('spongebob')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.screaming-snake', caseHandler('screaming-snake')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.humanize', caseHandler('humanize')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.case.slugify', caseHandler('slugify')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.remove-accents', diacriticHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.a', dnsHandler('A')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.aaaa', dnsHandler('AAAA')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.any', dnsHandler('ANY')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.caa', dnsHandler('CAA')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.cname', dnsHandler('CNAME')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.mx', dnsHandler('MX')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.naptr', dnsHandler('NAPTR')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.ns', dnsHandler('NS')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.ptr', dnsHandler('PTR')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.soa', dnsHandler('SOA')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.srv', dnsHandler('SRV')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.txt', dnsHandler('TXT')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.lookup', dnsHandler('LOOKUP')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.dns.reverse', dnsHandler('REVERSE')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.url.parse', urlHandler('PARSE_TO_JSON')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.url.parse-params', urlHandler('PARSE_PARAMS_TO_JSON')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.url.encode-uri', urlHandler('ENCODE_URI')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.url.decode-uri', urlHandler('DECODE_URI')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.url.encode-uri-component', urlHandler('ENCODE_URI_COMPONENT')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.url.decode-uri-component', urlHandler('DECODE_URI_COMPONENT')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.jwt.decode', jwtHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.saml.decode', samlHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.whois', whoisHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.har-to-mermaid', harToMermaidHandler('mermaid')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.har-to-image', harToMermaidHandler('image')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.x509', x509CertificateHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hash-sha1', cryptoHandler('sha1', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hash-sha256', cryptoHandler('sha256', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hash-sha512', cryptoHandler('sha512', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hash-md5', cryptoHandler('md5', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hash-sha1.replace', cryptoHandler('sha1', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hash-sha256.replace', cryptoHandler('sha256', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hash-sha512.replace', cryptoHandler('sha512', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hash-md5.replace', cryptoHandler('md5', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hmac-sha256', hmacHandler('sha256')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hmac-sha512', hmacHandler('sha512')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.hmac-md5', hmacHandler('md5')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.geo-ip', geoIpHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.remove-cursor-above', removeCursorHandler('above')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.remove-cursor-below', removeCursorHandler('below')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.remove-character-from-each-side', removeCharacterFromEachSideHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.client-credentials-flow', clientCredentialsFlowHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.encrypt', aesHandler('encrypt', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.decrypt', aesHandler('decrypt', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.encrypt.replace', aesHandler('encrypt', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.crypto.decrypt.replace', aesHandler('decrypt', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.random.uuid', randomHandler('uuid')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.escape', escapeHandler('escape', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.unescape', escapeHandler('unescape', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.escape.replace', escapeHandler('escape', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.unescape.replace', escapeHandler('unescape', true)));

  // Programmatic Handlers
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.json-to-yaml', jsonToYamlHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.json-to-yaml.replace', jsonToYamlHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.yaml-to-json', yamlToJsonHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.yaml-to-json.replace', yamlToJsonHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.hex-to-rgb', hexToRgbHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.hex-to-rgb.replace', hexToRgbHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.rgb-to-hex', rgbToHexHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.rgb-to-hex.replace', rgbToHexHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.toggle-quotes', toggleQuotesHandler));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.hex-to-decimal', hexToDecimalHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.hex-to-decimal.replace', hexToDecimalHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.decimal-to-hex', decimalToHexHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.programmatic.decimal-to-hex.replace', decimalToHexHandler(true)));

  // Japanese Handlers
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.japanese.full-to-half', fullWidthToHalfWidthHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.japanese.full-to-half.replace', fullWidthToHalfWidthHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.japanese.half-to-full', halfWidthToFullWidthHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.japanese.half-to-full.replace', halfWidthToFullWidthHandler(true)));

  // New Features (Items 62-94)
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.quote.single', encloseHandler('single')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.quote.double', encloseHandler('double')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.quote.backtick', encloseHandler('backtick')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.paren', encloseHandler('paren')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.square', encloseHandler('square')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.curly', encloseHandler('curly')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.angle', encloseHandler('angle')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.japanese.quote-single', encloseHandler('japanese-quote-single')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.japanese.quote-double', encloseHandler('japanese-quote-double')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.japanese.bracket', encloseHandler('japanese-bracket')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.japanese.angle', encloseHandler('japanese-angle')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.japanese.paren', encloseHandler('japanese-paren')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.japanese.square', encloseHandler('japanese-square')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.enclose.japanese.curly', encloseHandler('japanese-curly')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.markdown.link', markdownHandler('link')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.insert.date.iso', insertDateHandler('iso')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.insert.date.locale', insertDateHandler('locale')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.insert.date.timestamp', insertDateHandler('timestamp')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.random.lorem-ipsum', randomHandler('lorem-ipsum')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.trim-lines-trailing', textCleanupHandler('trim-lines-trailing')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.remove-duplicate-lines', textCleanupHandler('remove-duplicate-lines')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.japanese.hiragana-to-katakana', hiraganaToKatakanaHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.japanese.hiragana-to-katakana.replace', hiraganaToKatakanaHandler(true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.japanese.katakana-to-hiragana', katakanaToHiraganaHandler(false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.japanese.katakana-to-hiragana.replace', katakanaToHiraganaHandler(true)));

  // ASCII Handlers
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.cowsay', asciiArtHandler('cowsay', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.cowsay.replace', asciiArtHandler('cowsay', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.tux', asciiArtHandler('tux', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.tux.replace', asciiArtHandler('tux', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.ghost', asciiArtHandler('ghost', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.ghost.replace', asciiArtHandler('ghost', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.meow', asciiArtHandler('meow', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.meow.replace', asciiArtHandler('meow', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.pig', asciiArtHandler('pig', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.pig.replace', asciiArtHandler('pig', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.face', asciiArtHandler('face', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.ascii.face.replace', asciiArtHandler('face', true)));

  // Text Cleanup Handlers
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.remove-empty-lines', textCleanupHandler('remove-empty-lines')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.remove-line-numbers', textCleanupHandler('remove-line-numbers')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.trim-lines', textCleanupHandler('trim-lines')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.join-lines.space', textCleanupHandler('join-lines-space')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.join-lines.comma', textCleanupHandler('join-lines-comma')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.split-lines.space', textCleanupHandler('split-lines-space')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.split-lines.comma', textCleanupHandler('split-lines-comma')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.normalize-whitespace', textCleanupHandler('normalize-whitespace')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.strip-html-tags', textCleanupHandler('strip-html-tags')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.text.unsmart-quotes', textCleanupHandler('unsmart-quotes')));

  // Unit Conversion Handlers
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.unit.px-to-rem', unitConvertHandler('px-to-rem')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.unit.rem-to-px', unitConvertHandler('rem-to-px')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.unit.kg-to-lb', unitConvertHandler('kg-to-lb')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.unit.lb-to-kg', unitConvertHandler('lb-to-kg')));

  // Math Handlers
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.math.sum', mathHandler('sum')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.math.average', mathHandler('average')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.math.min', mathHandler('min')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.math.max', mathHandler('max')));

  // Random Handlers (New)
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.random.password', randomHandler('password')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.random.ipv4', randomHandler('ipv4')));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.random.ipv6', randomHandler('ipv6')));

  // CSV Handlers
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.csv.to-markdown', csvHandler('csv-to-markdown', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.csv.to-markdown.replace', csvHandler('csv-to-markdown', true)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.csv.from-markdown', csvHandler('markdown-to-csv', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.csv.from-markdown.replace', csvHandler('markdown-to-csv', true)));

  // Data Struct Handlers
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.data.env-to-json', dataStructHandler('env-to-json', false)));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('selection-manipulator.data.env-to-json.replace', dataStructHandler('env-to-json', true)));

  // Provider
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(ResultProvider.scheme, ResultProvider.instance));
}

export function deactivate() { }
