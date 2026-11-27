import { withinSignal } from "../../utils/within-signal";
import { HTTP_REFUSALS } from "../ws/http-protocol";

/** What a refusal's JSON body says: the code it names, and its message. */
export interface RefusalSaid {
  readonly code?: unknown;
  readonly message?: string;
}

/** What a refusal's body is read to: a Courier server's is a few dozen bytes. */
const MAX_REFUSAL_BYTES = 4096;

/*
 * The server's refusals that end a connection for good, by the code their
 * bodies name, and the close each ends a socket with, as the server's
 * socket closes for the same: a request it cannot read, 1002, and an
 * origin or a host it does not serve, 4403 and 4421. Only the server's
 * word stops a connection: a status, which an entry or a gateway answers
 * with too, does not, whatever its body says.
 */
const FINAL_REFUSALS: ReadonlyMap<unknown, number> = new Map<unknown, number>([
  [HTTP_REFUSALS.malformed, 1002],
  ["BODY_MALFORMED", 1002],
  ["ORIGIN_NOT_ALLOWED", 4403],
  ["HOST_NOT_ALLOWED", 4421],
]);

/**
 * The close a refusal ends a socket with: the server's own for a refusal
 * that ends the connection for good. Any other — the server's that a new
 * connection gets past, as another version of the transport or frames it
 * did not receive, and every one of an entry's — closes as a socket the
 * network cut, with 1006, or 1009 for a body too large, and the
 * connection is made again.
 *
 * @param status - The refusal's status
 * @param said - What its body says
 * @returns The close's code and reason
 * @example
 * ```ts
 * refusalClose(421, { code: "HOST_NOT_ALLOWED", message: "Host not allowed" }); // { code: 4421, … }
 * ```
 */
export function refusalClose(
  status: number,
  said: RefusalSaid,
): { readonly code: number; readonly reason: string } {
  const final = FINAL_REFUSALS.get(said.code);
  if (final !== undefined) {
    return { code: final, reason: said.message ?? `The server answered ${status}` };
  }
  const answered = `The socket's path answered ${status}`;
  return {
    code: status === 413 ? 1009 : 1006,
    reason: said.message === undefined ? answered : `${answered}: ${said.message}`,
  };
}

/**
 * The code and message of a JSON refusal, read to its first 4 KiB, as it
 * comes or as it was handed over whole, as React Native's own fetch hands
 * one; an entry's page says neither, and a longer body says nothing.
 *
 * @param response - The refusal, its body unread
 * @param signal - The attempt's, which ends the read
 * @returns What its body says
 * @example
 * ```ts
 * const said = await readRefusal(response, attempt.signal);
 * ```
 */
export async function readRefusal(response: Response, signal: AbortSignal): Promise<RefusalSaid> {
  const body: ReadableStream<Uint8Array> | null | undefined = response.body;
  if (body === null) return {};
  if (!response.headers.get("Content-Type")?.includes("json")) {
    await body?.cancel().catch(() => undefined);
    return {};
  }
  try {
    const text =
      body === undefined ? await wholeText(response, signal) : await boundedText(body, signal);
    const said: unknown = JSON.parse(text);
    if (typeof said !== "object" || said === null) return {};
    const { code, message } = said as Record<string, unknown>;
    return { code, ...(typeof message === "string" && { message }) };
  } catch {
    return {};
  }
}

/* The text of a body handed over whole, up to the same bound. */
async function wholeText(response: Response, signal: AbortSignal): Promise<string> {
  const text = await withinSignal(signal, response.text());
  return new TextEncoder().encode(text).byteLength > MAX_REFUSAL_BYTES ? "" : text;
}

/* The body's text, up to its bound: one longer is let go of, and says nothing. */
async function boundedText(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const read = await withinSignal(signal, reader.read());
    if (read.done) return text + decoder.decode();
    size += read.value.byteLength;
    if (size > MAX_REFUSAL_BYTES) {
      await reader.cancel();
      return "";
    }
    text += decoder.decode(read.value, { stream: true });
  }
}
