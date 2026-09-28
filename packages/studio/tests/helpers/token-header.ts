import type { StudioServer } from "../../src/server";

import { TOKEN_HEADER } from "../../src/server/token-guard";

/**
 * The header a page opened from Studio's link presents, which every route
 * that changes something asks for.
 *
 * @param studio - The running Studio
 * @returns The header, to spread into a request's headers
 */
export function tokenHeader(studio: StudioServer | undefined): Record<string, string> {
  if (!studio) throw new Error("Studio is not running");
  return { [TOKEN_HEADER]: studio.token };
}
