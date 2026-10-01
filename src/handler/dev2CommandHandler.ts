/**
 * The DEVX-001..023 extended developer commands (group DEV2), by command name (without
 * `selection-manipulator.`). They use the DEV command handler with their own command table, so the
 * selections, the output limit, the notifications and the logging (never the selected text) are
 * those of the DEV commands.
 */
import { DevDependencies, devCommandHandlerInternal, defaultDevDependencies } from './devCommandHandler';
import { DEV2_COMMAND_ENTRIES } from './dev2Transforms';

/** The DEVX commands with replaceable dependencies (for the tests). */
export const dev2CommandHandlerInternal = (dependencies: DevDependencies) => devCommandHandlerInternal(dependencies, DEV2_COMMAND_ENTRIES);

export const dev2CommandHandler = dev2CommandHandlerInternal(defaultDevDependencies);
