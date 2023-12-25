import {
  TextEditor,
  window,
  commands,
} from 'vscode';

const myCommands = [
  {
    "command": "selection-manipulator.multi-selection",
    "title": "Select - Convert to Multi Selection",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.extract",
    "title": "Extract - Extract Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.extract.exclude-blank-rows",
    "title": "Extract - Extract Lines exclude Blank Rows",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.unique",
    "title": "Extract - Unique Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.reverse",
    "title": "Extract - Reverse Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.shuffle",
    "title": "Extract - Shuffle Lines",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.string.ascending",
    "title": "Extract - Sort Lines Ascending by string",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.string.descending",
    "title": "Extract - Sort Lines Descending by string",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.number.ascending",
    "title": "Extract - Sort Lines Ascending by number",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.sort.number.descending",
    "title": "Extract - Sort Lines Descending by number",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.json.format",
    "title": "Transform - JSON - Format JSON (Pretty Print)",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.json.minify",
    "title": "Transform - JSON - Minify JSON",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.json.parse",
    "title": "Transform - JSON - Parse JSON",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.json.stringify",
    "title": "Transform - JSON - Stringify JSON",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.xml.format",
    "title": "Transform - XML - Format XML (Pretty Print)",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.xml.minify",
    "title": "Transform - XML - Minify XML",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.base64.encode",
    "title": "Transform - Base64 - Encode Base64",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.base64.decode",
    "title": "Transform - Base64 - Decode Base64",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.base64.deflate",
    "title": "Transform - Base64 - Deflate Base64",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.base64.unzip",
    "title": "Transform - Base64 - Inflate Base64",
    "canMultiSelection": false
  },
  {
    "command": "selection-manipulator.dns.a",
    "title": "Transform - DNS - A Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.aaaa",
    "title": "Transform - DNS - AAAA Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.any",
    "title": "Transform - DNS - ANY Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.caa",
    "title": "Transform - DNS - CAA Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.cname",
    "title": "Transform - DNS - CNAME Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.mx",
    "title": "Transform - DNS - MX Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.naptr",
    "title": "Transform - DNS - NAPTR Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.ns",
    "title": "Transform - DNS - NS Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.ptr",
    "title": "Transform - DNS - PTR Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.soa",
    "title": "Transform - DNS - SOA Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.srv",
    "title": "Transform - DNS - SRV Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.txt",
    "title": "Transform - DNS - TXT Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.dns.reverse",
    "title": "Transform - DNS - REVERSE Record",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.count-occurrences.count",
    "title": "Transform - Count Occurrences sorting by count",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.count-occurrences.word",
    "title": "Transform - Count Occurrences sorting by word",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.count-up-list",
    "title": "Transform - Count Up to List",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.camel",
    "title": "Replace - Case - Change Case Camel",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.capital",
    "title": "Replace - Case - Change Case Capital",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.constant",
    "title": "Replace - Case - Change Case Constant",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.dot",
    "title": "Replace - Case - Change Case Dot",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.kebab",
    "title": "Replace - Case - Change Case Kebab",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.no",
    "title": "Replace - Case - Change Case No",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.pascal",
    "title": "Replace - Case - Change Case Pascal",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.path",
    "title": "Replace - Case - Change Case Path",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.sentence",
    "title": "Replace - Case - Change Case Sentence",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.snake",
    "title": "Replace - Case - Change Case Snake",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.train",
    "title": "Replace - Case - Change Case Train",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.upper",
    "title": "Replace - Case - Change Case Upper",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.case.lower",
    "title": "Replace - Case - Change Case Lower",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.zero-padding",
    "title": "Replace - Number - Zero Padding",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.increment-from-1",
    "title": "Replace - Number - Increment from 1",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.increment-from-n",
    "title": "Replace - Number - Increment from N",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.decrement-to-1",
    "title": "Replace - Number - Decrement to 1",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.decrement-to-n",
    "title": "Replace - Number - Decrement to N",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.increment-by-1",
    "title": "Replace - Number - Increment by 1",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.increment-by-n",
    "title": "Replace - Number - Increment by N",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.decrement-by-1",
    "title": "Replace - Number - Decrement by 1",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.decrement-by-n",
    "title": "Replace - Number - Decrement by N",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.calculation",
    "title": "Calculate - Calculate Mathematical Expression",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.calculation.date",
    "title": "Calculate - Transform to Timestamp and ISO 8601",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.regex.g",
    "title": "Regular Expression - Regex (/PATTERN/g)",
    "canMultiSelection": true
  },
  {
    "command": "selection-manipulator.regex.gi",
    "title": "Regular Expression - Regex (/PATTERN/gi)",
    "canMultiSelection": true
  }
];

export const showCommandsHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const isMultiSelection = textEditor.selections.length > 1;
  const options = { title: "Selection Manipulator Commands", canPickMany: false };
  const commandTitles = myCommands
    .filter(command => isMultiSelection ? command.canMultiSelection : true)
    .map(command => command.title);
  const selectedCommandTitle = await window.showQuickPick(commandTitles, options);
  if (!selectedCommandTitle) {
    return;
  }
  const selectedCommand = myCommands.find(command => command.title === selectedCommandTitle);
  if (selectedCommand) {
    commands.executeCommand(selectedCommand.command);
  }
};
