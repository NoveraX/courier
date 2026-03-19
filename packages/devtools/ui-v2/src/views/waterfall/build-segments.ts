import type { RequestTiming, ProxyTiming } from "@/store/types-events";

import type { WaterfallSegment } from "./types";

// ── Direct mode: 4 segments ───────────────────────────────────────────────

export function buildDirectSegments(timing: RequestTiming): WaterfallSegment[] {
  let offset = 0;
  const segments: WaterfallSegment[] = [];

  const push = (key: WaterfallSegment["key"], duration: number): void => {
    if (duration > 0) segments.push({ key, start: offset, duration });
    offset += duration;
  };

  // Split middleware time evenly between req/res phases
  const mwHalf = timing.middleware / 2;
  push("middleware-req", mwHalf);
  push("fetch", timing.fetch);
  push("validation", timing.validation);
  push("middleware-res", timing.middleware - mwHalf);

  return segments;
}

// ── Proxy mode: 6 segments (network + server phases) ─────────────────────

export function buildProxySegments(
  timing: RequestTiming,
  proxy: ProxyTiming,
): WaterfallSegment[] {
  let offset = 0;
  const segments: WaterfallSegment[] = [];

  const push = (key: WaterfallSegment["key"], duration: number): void => {
    if (duration > 0) segments.push({ key, start: offset, duration });
    offset += duration;
  };

  const mwHalf = timing.middleware / 2;

  // Full timeline: browser network → server processing → browser network
  push("client-to-proxy", proxy.clientToProxy);
  push("middleware-req", mwHalf);
  push("fetch", timing.fetch);
  push("validation", timing.validation);
  push("middleware-res", timing.middleware - mwHalf);
  push("proxy-to-client", proxy.proxyToClient);

  return segments;
}
