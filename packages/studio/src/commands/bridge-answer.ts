type Message = Record<string, unknown>;

/* The protocol's code for an error the server met, which is all a stdio client is told of an HTTP failure. */
const INTERNAL_ERROR = -32603;

/**
 * The line a client is answered with for one of its messages, from what
 * came back from Studio: Studio's own answer, when it is one for this
 * message — an error included — and otherwise an error under the message's
 * id that says what answered instead: a Studio that refused this project's
 * token, or an address where no Studio's MCP endpoint answers. Without it a
 * client would wait for an answer that never comes. A notification is
 * answered with nothing.
 *
 * @param message - The client's message, when it was JSON
 * @param status - The HTTP status Studio's address answered with
 * @param text - The body it answered with
 * @param url - Studio's MCP endpoint, as the bridge was given it
 * @returns The line, or `undefined` for none
 * @example
 * ```ts
 * answerFor({ jsonrpc: "2.0", id: 1, method: "tools/list" }, 401, body, "http://localhost:6280/mcp");
 * ```
 */
export function answerFor(
  message: Message | undefined,
  status: number,
  text: string,
  url: string,
): string | undefined {
  if (message !== undefined && message.id === undefined) return undefined;
  const answer = parsedObject(text);
  if (message === undefined || answer?.id === message.id) return text.replace(/\n/g, "");
  if (status === 401) {
    return failure(
      message.id,
      `Studio at ${url} did not take the token in this project's .courier/studio-token: the Studio answering there runs another project, or started before the token changed. Start this project's Studio with npx @noverax/courier-studio, or point --url at it`,
    );
  }
  return failure(
    message.id,
    `No Studio answered at ${url} (HTTP ${status}): start this project's Studio with npx @noverax/courier-studio, or point --url at the address it prints`,
  );
}

/**
 * The line that tells a client Studio could not be reached at all.
 *
 * @param message - The client's message, when it was JSON
 * @param url - Studio's MCP endpoint
 * @param reason - Why the connection failed
 * @returns The line, or `undefined` for a notification, which is answered with nothing
 * @example
 * ```ts
 * unreachable({ jsonrpc: "2.0", id: 1, method: "tools/list" }, url, "connect ECONNREFUSED");
 * ```
 */
export function unreachable(
  message: Message | undefined,
  url: string,
  reason: string,
): string | undefined {
  if (message?.id === undefined) return undefined;
  return failure(
    message.id,
    `Studio could not be reached at ${url} (${reason}): start it with npx @noverax/courier-studio`,
  );
}

function failure(id: unknown, text: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code: INTERNAL_ERROR, message: text } });
}

function parsedObject(text: string): Message | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Message)
      : undefined;
  } catch {
    return undefined;
  }
}
