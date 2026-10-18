import { carriedBody, type KeptBodies, studioHooks } from "@noverax/courier/internal";
import type { EventBus } from "../../event-bus";
import type {
  AnyStudioEvent,
  RequestAbortEvent,
  RequestEndEvent,
  RequestErrorEvent,
  RequestShapeEvent,
  RequestStartEvent,
  SharedAnswer,
} from "../../events";
import { readCause } from "../../events/read-cause";
import { readShared } from "../../events/read-shared";
import { answerShapeOf } from "../answer-shape";
import { boundedText } from "../bounded-text";

/* The mark of a call another call's request answered, as the event carries it, or nothing. */
function sharedField(raw: unknown): { shared?: SharedAnswer } {
  const shared = readShared(raw);
  return shared ? { shared } : {};
}

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/**
 * Wire request lifecycle hooks to the bus. A body too large for an event —
 * the variables, the answer, an error's body — travels as a part of it, and
 * `bodies` keeps the whole for Studio to ask for. An error's text and why
 * no answer came go as the app was told them — the page that holds
 * Studio's token shows them whole, and Studio cuts what leaves it.
 */
export function wireRequestHooks(
  bus: EventBus,
  sessionId: string,
  resolveSourceName: (name: string) => string,
  bodies: KeptBodies,
): void {
  studioHooks.onRequestStart = (e) => {
    const sent = carriedBody(e.variables);
    bodies.keep(e.id, "request", sent);
    bus.emit(
      createEvent<RequestStartEvent>(sessionId, {
        id: e.id,
        type: "request:start",
        timestamp: e.timestamp,
        source: resolveSourceName(e.source),
        group: e.group,
        method: e.method,
        variables: sent.value,
        ...(sent.whole && { variablesCutFrom: sent.whole.bytes }),
        mode: e.mode,
        middlewareCount: e.middlewareCount,
        hasValidation: e.hasValidation,
        ...(e.httpMethod && { httpMethod: e.httpMethod }),
        ...(e.endpointType && { endpointType: e.endpointType }),
        ...(e.purpose && { purpose: e.purpose }),
        ...(e.agent && { agent: e.agent }),
        ...(e.idempotencyKey && { idempotencyKey: e.idempotencyKey }),
      }),
    );
  };

  studioHooks.onRequestEnd = (e) => {
    const answered = carriedBody(e.data);
    bodies.keep(e.id, "response", answered);
    bus.emit(
      createEvent<RequestEndEvent>(sessionId, {
        id: e.id,
        type: "request:end",
        timestamp: e.timestamp,
        requestId: e.id,
        status: e.status,
        data: answered.value,
        ...(answered.whole && { dataCutFrom: answered.whole.bytes }),
        size: e.size,
        headers: e.headers,
        requestHeaders: e.requestHeaders,
        timing: e.timing,
        ...(e.proxyTiming && { proxyTiming: e.proxyTiming }),
        ...sharedField(e.shared),
      }),
    );
  };

  studioHooks.onRequestError = (e) => {
    const answered = e.data === undefined ? undefined : carriedBody(e.data);
    const cause = readCause(e.error.cause);
    if (answered) bodies.keep(e.id, "response", answered);
    bus.emit(
      createEvent<RequestErrorEvent>(sessionId, {
        id: e.id,
        type: "request:error",
        timestamp: e.timestamp,
        requestId: e.id,
        error: {
          type: e.error.type,
          message: boundedText(e.error.message),
          ...(e.error.status !== undefined && { status: e.error.status }),
          ...(cause && { cause }),
        },
        ...(e.status !== undefined && { status: e.status }),
        ...(e.headers && { headers: e.headers }),
        ...(e.requestHeaders && { requestHeaders: e.requestHeaders }),
        ...(answered && { data: answered.value }),
        ...(answered?.whole && { dataCutFrom: answered.whole.bytes }),
        ...(e.size !== undefined && { size: e.size }),
        ...(e.timing && { timing: e.timing }),
        ...(e.proxyTiming && { proxyTiming: e.proxyTiming }),
        ...sharedField(e.shared),
      }),
    );
  };

  studioHooks.onRequestAbort = (e) => {
    bus.emit(
      createEvent<RequestAbortEvent>(sessionId, {
        id: e.id,
        type: "request:abort",
        timestamp: e.timestamp,
        requestId: e.id,
        reason: e.reason,
      }),
    );
  };

  studioHooks.onAnswer = (e) => {
    /* Read now, before the response schema reads the answer and strips what it does not declare. */
    const { shape, cut } = answerShapeOf(e.data);
    bus.emit(
      createEvent<RequestShapeEvent>(sessionId, {
        id: e.requestId,
        type: "request:shape",
        timestamp: e.timestamp,
        requestId: e.requestId,
        shape,
        cut,
      }),
    );
  };
}
