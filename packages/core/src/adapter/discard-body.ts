import { createLogger } from "../logger";

const log = createLogger("Proxy");

/**
 * Take the rest of a refused request's body off the connection, keeping none
 * of it.
 *
 * A browser reads a response only once its upload is done or the connection
 * closes. Refused without being read, a body stays on the connection: the
 * browser waits on its own upload, and the refusal reaches it only when the
 * server's keep-alive timer closes the socket — 6 s on most servers, 73 s on
 * Fastify, never on a fresh Nuxt dev server. Node discards a body its handler
 * left alone, but not one a framework has already started streaming into a
 * Web request, which is how SvelteKit, Nuxt and React Router hand it over.
 *
 * Nothing read here is held, so the memory bound the refusal enforced still
 * holds. How long a client may keep sending is the server's own request
 * timeout, as it is for any body Node discards for itself. The read runs
 * after the handler has answered; the answer does not wait for it.
 *
 * @param request - The request being refused
 *
 * @example
 * ```ts
 * discardBody(request);
 * return errorResponse(413, "Request body exceeds 1048576 bytes");
 * ```
 */
export function discardBody(request: Request): void {
  const body = request.body;
  if (!body || body.locked) return;
  void drain(body.getReader());
}

async function drain(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    for (;;) {
      const { done } = await reader.read();
      if (done) return;
    }
  } catch (error) {
    /* The client gave up on the upload — it has already been refused. */
    log.debug("A refused request body ended before it was complete", error);
  } finally {
    reader.releaseLock();
  }
}
