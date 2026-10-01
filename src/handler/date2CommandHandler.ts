/**
 * The DATEX-001..015 extended date commands (group DATE2), by command name (without
 * `selection-manipulator.`). They use the DATE command handler with their own command table, so the
 * selections, the input boxes, the output limit, the notifications and the logging (never the
 * selected text) are those of the DATE commands.
 */
import { DateDependencies, dateCommandHandlerInternal, defaultDateDependencies } from './dateCommandHandler';
import { DATE2_COMMAND_ENTRIES } from './date2Transforms';

/** The DATEX date commands with replaceable dependencies (for the tests). */
export const date2CommandHandlerInternal = (dependencies: DateDependencies) => dateCommandHandlerInternal(dependencies, DATE2_COMMAND_ENTRIES);

export const date2CommandHandler = date2CommandHandlerInternal(defaultDateDependencies);
