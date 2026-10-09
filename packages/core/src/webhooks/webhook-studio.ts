import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createLogger } from "../logger";
import { generateRequestId, studioHooks } from "../studio";
import { reportAnswer, reportRefusal, reportSchema, reportStart } from "./webhook-events";
import { rememberRoute } from "./webhook-registry";

const log = createLogger("Webhook");

/** What a delivery tells Studio as it is handled, and how it is answered. */
export interface WebhookStudio {
  /** The delivery has been read: it shows in the Timeline, the body as its variables once checked */
  start(event: string | undefined, body: unknown): void;
  /** The body went against the schema: it passed, or the schema refused it with these issues */
  checked(issues?: readonly StandardSchemaV1.Issue[]): void;
  /** Refuse the delivery with a status and a reason, which the Timeline shows as a failure */
  refuse(status: number, message: string, issues?: readonly StandardSchemaV1.Issue[]): Response;
  /** Run the handler and answer as it says: 204 for nothing, its `Response`, 500 when it throws */
  answer(run: () => unknown): Promise<Response>;
}

/**
 * The bridge between one delivery and Studio's Timeline: the delivery shows
 * as a call made to the app — mode `webhook`, the webhook's name as its
 * source, the event as its method, the body as its variables — with how
 * long its checks took, the headers it came with, and how it was answered
 * or why it was refused. Without Studio attached, it only answers.
 *
 * @param name - The webhook's name
 * @param request - The delivery
 * @returns The bridge
 * @example
 * ```ts
 * const studio = webhookStudio("stripe", request);
 * if (!verified) return studio.refuse(401, "The delivery's signature does not match");
 * ```
 */
export function webhookStudio(name: string, request: Request): WebhookStudio {
  const attached = studioHooks.onRequestStart !== undefined;
  /* Where the application mounts the webhook, for a delivery Studio has sent. */
  if (attached) rememberRoute(name, request.url);
  const id = attached ? generateRequestId() : "";
  const t0 = performance.now();
  let started = false;
  let checksMs: number | undefined;
  const timing = () => {
    const total = performance.now() - t0;
    return { total, middleware: 0, fetch: 0, validation: checksMs ?? total };
  };
  const start = (event: string | undefined, body: unknown) => {
    if (!attached || started) return;
    started = true;
    reportStart(id, name, request, { event, body });
  };
  const refuse = (status: number, message: string, issues?: readonly StandardSchemaV1.Issue[]) => {
    const answer = { error: message, ...(issues && { issues: issuesOf(issues) }) };
    start(undefined, undefined);
    if (attached) reportRefusal(id, request, { status, message, answer, timing: timing() });
    return Response.json(answer, { status });
  };
  return {
    start,
    checked(issues) {
      checksMs = performance.now() - t0;
      if (attached) reportSchema(id, checksMs, issues);
    },
    refuse,
    async answer(run) {
      let answered: unknown;
      try {
        answered = await run();
      } catch (error) {
        log.error(`The ${name} webhook's handler failed`, error);
        return refuse(500, "The webhook's handler failed");
      }
      const response =
        answered instanceof Response ? answered : new Response(null, { status: 204 });
      if (attached) reportAnswer(id, request, response, timing());
      return response;
    },
  };
}

/* Each place the schema refused and why, as the sender is answered: no values from the body. */
function issuesOf(issues: readonly StandardSchemaV1.Issue[]): { path?: string; message: string }[] {
  return issues.map((issue) => ({
    ...(issue.path && { path: issue.path.map(segmentOf).join(".") }),
    message: issue.message,
  }));
}

function segmentOf(segment: PropertyKey | StandardSchemaV1.PathSegment): string {
  return String(typeof segment === "object" ? segment.key : segment);
}
