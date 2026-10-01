/**
 * The DATEX-016..020 and 022..024 generator and random commands (group DATE2), by command name
 * (without `selection-manipulator.`). They use the GEN command handler with their own command
 * table, so the targets, the input boxes, the output limit, the notifications and the logging
 * (never the selected text) are those of the GEN commands.
 */
import { defaultGenDependencies, GenDependencies, genCommandHandlerInternal } from './genCommandHandler';
import { GEN2_COMMAND_ENTRIES } from './gen2Transforms';

/** The DATEX generator and random commands with replaceable dependencies (for the tests). */
export const gen2CommandHandlerInternal = (dependencies: GenDependencies) => genCommandHandlerInternal(dependencies, GEN2_COMMAND_ENTRIES);

export const gen2CommandHandler = gen2CommandHandlerInternal(defaultGenDependencies);
