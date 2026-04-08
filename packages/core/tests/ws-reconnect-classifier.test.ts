import { describe, expect, it } from "vitest";
import { shouldReconnect } from "../src/realtime/ws/reconnect-classifier";

describe("shouldReconnect", () => {
  it.each([
    [1000, false, "normal close"],
    [1001, true, "going away (server restart)"],
    [1002, false, "protocol error"],
    [1003, false, "unsupported data"],
    [1005, true, "no status received"],
    [1006, true, "abnormal closure"],
    [1007, false, "invalid frame payload"],
    [1008, false, "policy violation"],
    [1009, false, "message too big"],
    [1011, true, "unexpected condition"],
    [1012, true, "service restart"],
    [1013, true, "try again later"],
    [1014, true, "bad gateway"],
    [1015, true, "TLS handshake"],
    [4000, false, "custom fatal lower bound"],
    [4050, false, "custom fatal mid"],
    [4099, false, "custom fatal upper bound"],
    [4100, true, "custom retriable lower bound"],
    [4200, true, "custom retriable"],
    [9999, true, "unknown defaults to retry"],
  ])("code %i → %s (%s)", (code, expected) => {
    expect(shouldReconnect(code)).toBe(expected);
  });
});
