import { provideServerCapability } from "../../capabilities/provide-server-capability";
import type { StudioHooks } from "../../studio/hooks";
import { createStudioReport } from "../../studio/studio-report";

/**
 * The hooks Studio's runtime sets in a page, as a page's bundle has them:
 * the bundle's own, never the global object's, so the page's calls tell
 * the runtime that runs in the bundle and no script outside it.
 */
export const studioHooks: StudioHooks = {};

let count = 0;

/** Generate a unique request ID for studio tracing */
export function generateRequestId(): string {
  const id = `req_${Date.now().toString(36)}_${count.toString(36)}`;
  count += 1;
  return id;
}

/* Lent to the page's own slot with the hooks, where Studio's runtime runs in the bundle. */
provideServerCapability("studio", createStudioReport(studioHooks, generateRequestId));
