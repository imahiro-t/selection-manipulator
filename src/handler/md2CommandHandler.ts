/**
 * The JAUNIX-015..021 extended Markdown commands (group JAUNI2), by command name (without
 * `selection-manipulator.`). They use the MD command handler with their own command table, so the
 * selections, the input boxes and quick picks, the output limit, the notifications and the logging
 * (never the selected text) are those of the MD commands.
 */
import { defaultMdDependencies, MdDependencies, mdCommandHandlerInternal } from './mdCommandHandler';
import { MD2_COMMAND_ENTRIES } from './md2Transforms';

/** The JAUNIX Markdown commands with replaceable dependencies (for the tests). */
export const md2CommandHandlerInternal = (dependencies: MdDependencies) => mdCommandHandlerInternal(dependencies, MD2_COMMAND_ENTRIES);

export const md2CommandHandler = md2CommandHandlerInternal(defaultMdDependencies);
