import {
  TextEditor,
  window,
  commands,
} from 'vscode';

const myCommands = [
  {
    "command": "selection-manipulator.multi-selection",
    "title": "Select - Convert to Multi Selection"
  },
  {
    "command": "selection-manipulator.extract",
    "title": "Extract - Extract Lines"
  },
  {
    "command": "selection-manipulator.extract.exclude-blank-rows",
    "title": "Extract - Extract Lines exclude Blank Rows"
  },
  {
    "command": "selection-manipulator.unique",
    "title": "Extract - Unique Lines"
  },
  {
    "command": "selection-manipulator.reverse",
    "title": "Extract - Reverse Lines"
  },
  {
    "command": "selection-manipulator.shuffle",
    "title": "Extract - Shuffle Lines"
  },
  {
    "command": "selection-manipulator.sort.string.ascending",
    "title": "Extract - Sort Lines Ascending by string"
  },
  {
    "command": "selection-manipulator.sort.string.descending",
    "title": "Extract - Sort Lines Descending by string"
  },
  {
    "command": "selection-manipulator.sort.number.ascending",
    "title": "Extract - Sort Lines Ascending by number"
  },
  {
    "command": "selection-manipulator.sort.number.descending",
    "title": "Extract - Sort Lines Descending by number"
  },
  {
    "command": "selection-manipulator.json.format",
    "title": "Transform - JSON - Format JSON (Pretty Print)"
  },
  {
    "command": "selection-manipulator.json.minify",
    "title": "Transform - JSON - Minify JSON"
  },
  {
    "command": "selection-manipulator.json.parse",
    "title": "Transform - JSON - Parse JSON"
  },
  {
    "command": "selection-manipulator.json.stringify",
    "title": "Transform - JSON - Stringify JSON"
  },
  {
    "command": "selection-manipulator.xml.format",
    "title": "Transform - XML - Format XML (Pretty Print)"
  },
  {
    "command": "selection-manipulator.xml.minify",
    "title": "Transform - XML - Minify XML"
  },
  {
    "command": "selection-manipulator.base64.encode",
    "title": "Transform - Base64 - Encode Base64"
  },
  {
    "command": "selection-manipulator.base64.decode",
    "title": "Transform - Base64 - Decode Base64"
  },
  {
    "command": "selection-manipulator.base64.deflate",
    "title": "Transform - Base64 - Deflate Base64"
  },
  {
    "command": "selection-manipulator.base64.unzip",
    "title": "Transform - Base64 - Inflate Base64"
  },
  {
    "command": "selection-manipulator.count-occurrences.count",
    "title": "Transform - Count Occurrences sorting by count"
  },
  {
    "command": "selection-manipulator.count-occurrences.word",
    "title": "Transform - Count Occurrences sorting by word"
  },
  {
    "command": "selection-manipulator.count-up-list",
    "title": "Transform - Count Up to List"
  },
  {
    "command": "selection-manipulator.case.camel",
    "title": "Replace - Case - Change Case Camel"
  },
  {
    "command": "selection-manipulator.case.capital",
    "title": "Replace - Case - Change Case Capital"
  },
  {
    "command": "selection-manipulator.case.constant",
    "title": "Replace - Case - Change Case Constant"
  },
  {
    "command": "selection-manipulator.case.dot",
    "title": "Replace - Case - Change Case Dot"
  },
  {
    "command": "selection-manipulator.case.kebab",
    "title": "Replace - Case - Change Case Kebab"
  },
  {
    "command": "selection-manipulator.case.no",
    "title": "Replace - Case - Change Case No"
  },
  {
    "command": "selection-manipulator.case.pascal",
    "title": "Replace - Case - Change Case Pascal"
  },
  {
    "command": "selection-manipulator.case.pascalSnake",
    "title": "Replace - Case - Change Case PascalSnake"
  },
  {
    "command": "selection-manipulator.case.path",
    "title": "Replace - Case - Change Case Path"
  },
  {
    "command": "selection-manipulator.case.sentence",
    "title": "Replace - Case - Change Case Sentence"
  },
  {
    "command": "selection-manipulator.case.snake",
    "title": "Replace - Case - Change Case Snake"
  },
  {
    "command": "selection-manipulator.case.train",
    "title": "Replace - Case - Change Case Train"
  },
  {
    "command": "selection-manipulator.case.upper",
    "title": "Replace - Case - Change Case Upper"
  },
  {
    "command": "selection-manipulator.case.lower",
    "title": "Replace - Case - Change Case Lower"
  },
  {
    "command": "selection-manipulator.zero-padding",
    "title": "Replace - Number - Zero Padding"
  },
  {
    "command": "selection-manipulator.increment-from-1",
    "title": "Replace - Number - Increment from 1"
  },
  {
    "command": "selection-manipulator.increment-from-n",
    "title": "Replace - Number - Increment from N"
  },
  {
    "command": "selection-manipulator.decrement-to-1",
    "title": "Replace - Number - Decrement to 1"
  },
  {
    "command": "selection-manipulator.decrement-to-n",
    "title": "Replace - Number - Decrement to N"
  },
  {
    "command": "selection-manipulator.increment-by-1",
    "title": "Replace - Number - Increment by 1"
  },
  {
    "command": "selection-manipulator.increment-by-n",
    "title": "Replace - Number - Increment by N"
  },
  {
    "command": "selection-manipulator.decrement-by-1",
    "title": "Replace - Number - Decrement by 1"
  },
  {
    "command": "selection-manipulator.decrement-by-n",
    "title": "Replace - Number - Decrement by N"
  },
  {
    "command": "selection-manipulator.calculation",
    "title": "Calculate - Calculate Mathematical Expression"
  },
  {
    "command": "selection-manipulator.calculation.date",
    "title": "Calculate - Transform to Timestamp and ISO 8601"
  },
  {
    "command": "selection-manipulator.regex.g",
    "title": "Regular Expression - Regex (/PATTERN/g)"
  },
  {
    "command": "selection-manipulator.regex.gi",
    "title": "Regular Expression - Regex (/PATTERN/gi)"
  }
];

export const showCommandsHandler: (textEditor: TextEditor) => void = async (textEditor) => {
  if (textEditor.selections.length === 0) {
    return;
  }
  const options = { title: "Selection Manipulator Commands", canPickMany: false };
  const commandTitles = myCommands.map(command => command.title);
  const selectedCommandTitle = await window.showQuickPick(commandTitles, options);
  if (!selectedCommandTitle) {
    return;
  }
  const selectedCommand = myCommands.find(command => command.title === selectedCommandTitle);
  if (selectedCommand) {
    commands.executeCommand(selectedCommand.command);
  }
};
