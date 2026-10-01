/**
 * DATEX-021 Generate - Cartesian Product of Selections (group DATE2), by command name (without
 * `selection-manipulator.`). It uses the MSEL command handler with its own command table (it is not
 * one of the Multi Cursor submenu commands of ALL_MSEL_COMMAND_ENTRIES), so the check for two or
 * more selections (before any input box), the input box, the edit (one undo step), the
 * notifications and the logging (never the selected text) are those of the MSEL commands.
 */
import { defaultMselDependencies, MselDependencies, mselCommandHandlerInternal } from './mselCommandHandler';
import { DATE2_MSEL_ENTRIES } from './gen2Cartesian';

/** DATEX-021 with replaceable dependencies (for the tests). */
export const date2MselCommandHandlerInternal = (dependencies: MselDependencies) => mselCommandHandlerInternal(dependencies, DATE2_MSEL_ENTRIES);

export const date2MselCommandHandler = date2MselCommandHandlerInternal(defaultMselDependencies);
