import type { LoadedCourierConfig } from "../config-loader";
import { declaredPortOf } from "../mock-manager/mock-ports";
import type { MocksEditContext } from "./mocks-edit-context";
import type { DeclarationState } from "./validate-declarations";

/**
 * What the requested mocks are checked against: the sources the config
 * declares, the mocks Studio loaded, the ports they hold, and Studio's own.
 *
 * @param ctx - The running Studio
 * @param loaded - What Studio runs
 * @param mocksFileName - The mocks file's name, for messages
 * @returns The state to validate against
 */
export function declarationState(
  ctx: MocksEditContext,
  loaded: LoadedCourierConfig,
  mocksFileName: string,
): DeclarationState {
  const declaredPorts = new Map<number, string>();
  for (const [key, entry] of Object.entries(loaded.mocks.entries)) {
    const port = declaredPortOf(entry);
    if (port !== undefined) declaredPorts.set(port, key);
  }
  return {
    sourceKeys: Object.keys(loaded.config.sources),
    declaredKeys: Object.keys(loaded.mocks.entries),
    declaredPorts,
    studioPort: ctx.studioPort(),
    mocksFileName,
  };
}
