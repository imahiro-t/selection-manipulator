/**
 * Reads the showcase data (scripts/showcase-data/<category>.json) for the tests that check the
 * commands of a category against their candidate ID, command ID, title and input / output example.
 *
 * The data does not hold titles: they come from package.json, so a test that compares the title
 * of a row with a `*_COMMAND_ENTRIES` table checks package.json and the table against each other.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

interface ShowcaseCommand {
  id: string;
  candidateId?: string;
  derivedFrom?: string;
  description: { en: string; ja: string };
  example?: { en: string; ja: string; japanese?: 'note' | 'data' };
}

/** One candidate command: [candidate ID, kind (`基本` / `派生:<ID>`), command ID, title, example (ja)]. */
export type CandidateRow = [string, string, string, string, string];

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) as T;

/** The commands of scripts/showcase-data/<category>.json, in the order of the file. */
export const showcaseCommands = (category: string): ShowcaseCommand[] =>
  readJson<{ category: string; commands: ShowcaseCommand[] }>(`scripts/showcase-data/${category}.json`).commands;

/**
 * The candidate commands of a category of the showcase data, in the order of the data (candidate ID
 * order): [candidate ID, kind, command ID, title from package.json, Japanese example].
 * A command that has no candidate ID, no example, or no title in package.json makes it throw.
 */
export const candidateRows = (category: string): CandidateRow[] => {
  const titles = new Map<string, string>(
    readJson<{ contributes: { commands: { command: string; title: string }[] } }>('package.json')
      .contributes.commands.map((c) => [c.command, c.title]),
  );
  return showcaseCommands(category).map((command) => {
    if (command.candidateId === undefined || command.example === undefined) {
      throw new Error(`${category}: ${command.id} has no candidate ID or no example`);
    }
    const title = titles.get(command.id);
    if (title === undefined) {
      throw new Error(`${category}: ${command.id} is not in package.json`);
    }
    const kind = command.derivedFrom === undefined ? '基本' : `派生:${command.derivedFrom}`;
    return [command.candidateId, kind, command.id, title, command.example.ja];
  });
};
