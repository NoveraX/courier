/**
 * Every event type a runtime reports about the requests it serves.
 *
 * Studio validates incoming events against this list before letting them into
 * its UI store, so a compromised runtime cannot inject arbitrary shapes. Both
 * ends read this one list, so the two cannot fall out of step, and a test
 * asserts it covers what the hooks emit.
 */

/** Emitted by `wireHooks` and `wireHttpHooks` onto the runtime event bus. */
export const RUNTIME_EVENT_TYPES: readonly string[] = [
  "request:start",
  "request:end",
  "request:error",
  "request:abort",
  "http:fetch:start",
  "http:fetch:end",
  "http:fetch:error",
  "proxy:receive",
  "proxy:parse",
  "proxy:respond",
  "proxy:origin-reject",
  "proxy:client-timing",
  "middleware:enter",
  "middleware:exit",
  "middleware:error",
  "validation:start",
  "validation:pass",
  "validation:fail",
  "stream:open",
  "stream:message",
  "stream:close",
  "stream:error",
  "cache:hit",
  "cache:miss",
  "cache:store",
  "cache:invalidate",
  "dedup:reuse",
  "dedup:abort",
  "upload:progress",
  "upload:complete",
];
