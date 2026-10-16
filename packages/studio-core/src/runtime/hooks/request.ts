import {
  carriedBody,
  type KeptBodies,
  shownCause,
  shownText,
  studioHooks,
} from "@noverax/courier/internal";
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
import { answerShapeOf } from "../answer-shape";
import { admittedOnStudioPass } from "../studio-passes";

/* How a call's read was shared, as the event carries it: the call that answered named only when known. */
function sharedOf(shared: { by: SharedAnswer["by"]; with?: string | undefined }): SharedAnswer {
  return { by: shared.by, ...(shared.with !== undefined && { with: shared.with }) };
}

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/**
 * Wire request lifecycle hooks to the bus. A body too large for an event —
 * the variables, the answer, an error's body — travels as a part of it, and
 * `bodies` keeps the whole for Studio to ask for. An error's text has what
 * could be a credential cut out: a header value read with its line break
 * fails with an error that quotes it.
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
        ...(admittedOnStudioPass(e.id) && { studioPass: true }),
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
        ...(e.shared && { shared: sharedOf(e.shared) }),
      }),
    );
  };

  studioHooks.onRequestError = (e) => {
    const answered = e.data === undefined ? undefined : carriedBody(e.data);
    const cause = shownCause(e.error.cause);
    if (answered) bodies.keep(e.id, "response", answered);
    bus.emit(
      createEvent<RequestErrorEvent>(sessionId, {
        id: e.id,
        type: "request:error",
        timestamp: e.timestamp,
        requestId: e.id,
        error: {
          type: e.error.type,
          message: shownText(e.error.message),
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
        ...(e.shared && { shared: sharedOf(e.shared) }),
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
