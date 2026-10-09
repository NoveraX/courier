import type { IncomingMessage, ServerResponse } from "node:http";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";
import { createMcpServer, handleHttp, requestStates } from "@noverax/courier-mcp/internal";
import type express from "express";

import { MAX_MESSAGE_BYTES } from "../max-message-bytes";
import type { StudioToken } from "../studio-token";
import { TOKEN_HEADER } from "../token-guard";
import { type StudioToolDeps, studioTools } from "./studio-tools";

/** Where Studio serves its MCP endpoint. */
export const STUDIO_MCP_PATH = "/mcp";

const INSTRUCTIONS =
  "Courier Studio records every request the running app makes through Courier, audits them, and runs its mock servers. " +
  "List the requests — the failed ones first, when debugging — then read one in full by its id; the audit says what to fix and where. " +
  "After a fix, send the request again with replay (a read) or replay_write (a write, which a person confirms).";

/* What a client that cannot ask a person to confirm a write is told to do instead. */
const UNASKED = "send it again from Studio's inspector, with its Replay button";

/**
 * Serve Studio's views to an editor's agent at `/mcp`, over MCP's
 * Streamable HTTP: the requests Studio recorded, one in full, its audit of
 * them, replays of them, the mocks it runs and their scenarios. A replay of
 * a write runs once a person confirms it, which a client is asked for in
 * the result it is answered with. A caller presents Studio's token — as a
 * bearer token, or in Studio's own header — and a page on another origin
 * is refused, as the protocol requires of a local server.
 *
 * @param app - Studio's Express app
 * @param deps - The token, and what the tools read and change
 * @example
 * ```ts
 * mountStudioMcp(app, { token, version: studioVersion(), requestLog, mocks, replays, agentCalls, audit });
 * ```
 */
export function mountStudioMcp(
  app: ReturnType<typeof express>,
  deps: StudioToolDeps & { token: StudioToken; version: string },
): void {
  const server = createMcpServer({
    info: { name: "courier-studio", version: deps.version },
    instructions: INSTRUCTIONS,
    tools: () => studioTools(deps),
    allowDestructive: false,
    states: requestStates(crypto.getRandomValues(new Uint8Array(32))),
    maxResultChars: 100_000,
    transport: "http",
    unasked: UNASKED,
  });
  const endpoint = {
    server,
    authorize: (request: Request) =>
      deps.token.matches(presented(request)) ? { studio: true } : null,
    maxBodyBytes: MAX_MESSAGE_BYTES,
  };
  /* Mounted at the path, so a request for it alone arrives as `/`; anything under it is not the endpoint. */
  app.use(STUDIO_MCP_PATH, async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if ((req.url ?? "/").split("?")[0] !== "/") return next();
    await sendWebResponse(await handleHttp(toWebRequest(req, res), endpoint), res);
  });
}

function presented(request: Request): string | undefined {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return bearer ?? request.headers.get(TOKEN_HEADER) ?? undefined;
}
