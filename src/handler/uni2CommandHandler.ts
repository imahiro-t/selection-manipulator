/**
 * The JAUNIX-008..014 extended Unicode commands (group JAUNI2), by command name (without
 * `selection-manipulator.`). They use the UNI command handler with their own command table, so the
 * selections, the output limit, the notifications and the logging (never the selected text) are
 * those of the UNI commands.
 */
import { defaultUniDependencies, UniDependencies, uniCommandHandlerInternal } from './uniCommandHandler';
import { UNI2_COMMAND_ENTRIES } from './uni2Transforms';

/** The JAUNIX Unicode commands with replaceable dependencies (for the tests). */
export const uni2CommandHandlerInternal = (dependencies: UniDependencies) => uniCommandHandlerInternal(dependencies, UNI2_COMMAND_ENTRIES);

export const uni2CommandHandler = uni2CommandHandlerInternal(defaultUniDependencies);
