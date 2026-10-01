/**
 * The NUMX-001..023 extended number commands (group NUM2), by command name (without
 * `selection-manipulator.`). They use the NUM command handler with their own command table, so the
 * selections, the input boxes, the output limit, the notifications and the logging (never the
 * selected text) are those of the NUM commands.
 */
import { defaultNumDependencies, NumDependencies, numHandlerInternal } from './numHandler';
import { NUM2_COMMAND_ENTRIES } from './num2Transforms';

/** The NUMX commands with replaceable dependencies (for the tests). */
export const num2CommandHandlerInternal = (dependencies: NumDependencies) => numHandlerInternal(dependencies, NUM2_COMMAND_ENTRIES);

export const num2CommandHandler = num2CommandHandlerInternal(defaultNumDependencies);
