import { getSocket } from "@/socket";

/* Long enough for a body of tens of megabytes to come back. */
const REPLY_TIMEOUT_MS = 15_000;

/** A request's whole body as JSON, or why there is none. */
export type BodyAnswer = { ok: true; data: string } | { ok: false; error: string };

/** Which request's body to ask for: one a mock answered, or one an app made. */
export type BodyAsk =
  | { event: "mock:body"; serverId: string; requestId: string; part: "request" | "response" }
  | { event: "request:body"; sessionId: string; requestId: string; part: "request" | "response" };

function answerOf(reply: unknown): BodyAnswer {
  if (typeof reply !== "object" || reply === null) {
    return { ok: false, error: "Studio sent no body." };
  }
  const ok: unknown = Reflect.get(reply, "ok");
  const data: unknown = Reflect.get(reply, "data");
  const error: unknown = Reflect.get(reply, "error");
  if (ok === true && typeof data === "string") return { ok: true, data };
  return { ok: false, error: typeof error === "string" ? error : "Studio sent no body." };
}

/**
 * Ask Studio for a request's whole body, which its event carried only a
 * part of: Studio asks the mock that answered it, or the app that made it,
 * which keep the whole bodies of their latest requests.
 *
 * @param ask - Which request, of which mock or app, and which of its bodies
 * @returns The body as JSON text, or why there is none
 * @example
 * ```ts
 * const answer = await askForBody({ event: "request:body", sessionId, requestId, part: "response" });
 * if (answer.ok) downloadFile(answer.data, "api.orders.list-response.json");
 * ```
 */
export function askForBody({ event, ...asked }: BodyAsk): Promise<BodyAnswer> {
  return new Promise((resolve) => {
    getSocket()
      .timeout(REPLY_TIMEOUT_MS)
      .emit(event, asked, (error: Error | null, reply: unknown) => {
        resolve(error ? { ok: false, error: "Studio did not answer." } : answerOf(reply));
      });
  });
}
