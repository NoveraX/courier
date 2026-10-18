import { sendWebResponse } from "@noverax/courier/node";
import type { FastifyReply } from "fastify";

/**
 * Write a Web answer to Fastify's raw response, the reply handed over from
 * Fastify first: until then its handler timeout runs, and the 503 it answers
 * once it fires was written over a stream already under way. A failure
 * before the head, which Fastify can no longer answer, is answered 500 here;
 * one after it leaves the answer cut, as `sendWebResponse` cut it. Either way
 * the failure is rethrown, for Fastify to log.
 *
 * @param reply - The reply the route was given
 * @param answer - The answer to send
 * @returns Once the answer is written, or its client has gone
 * @throws The failure that stopped it, once it is answered or cut
 * @example
 * ```ts
 * await sendHijacked(reply, await handle(toWebRequest(request.raw, reply.raw)));
 * ```
 */
export async function sendHijacked(reply: FastifyReply, answer: Response): Promise<void> {
  reply.hijack();
  try {
    await sendWebResponse(answer, reply.raw);
  } catch (error) {
    if (!reply.raw.headersSent) {
      reply.raw.writeHead(500, { "content-type": "application/json" });
      reply.raw.end(JSON.stringify({ success: false, message: "Internal server error" }));
    }
    throw error;
  }
}
