/**
 * The JAUNIX-001..007 extended Japanese text commands (group JAUNI2), by command name (without
 * `selection-manipulator.`). They use the JA command handler with their own command table, so the
 * selections, the quick pick, the output limit, the notifications and the logging (never the
 * selected text) are those of the JA commands.
 */
import { defaultJaDependencies, JaDependencies, jaCommandHandlerInternal } from './jaCommandHandler';
import { JA2_COMMAND_ENTRIES } from './ja2Transforms';

/** The JAUNIX Japanese commands with replaceable dependencies (for the tests). */
export const ja2CommandHandlerInternal = (dependencies: JaDependencies) => jaCommandHandlerInternal(dependencies, JA2_COMMAND_ENTRIES);

export const ja2CommandHandler = ja2CommandHandlerInternal(defaultJaDependencies);
