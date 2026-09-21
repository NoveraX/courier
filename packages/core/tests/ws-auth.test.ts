import { describe, expect, it } from "vitest";

import { extractWSAuth } from "../src/adapter/ws-auth";

function makeRequest(headers: Record<string, string> = {}, url = "http://localhost/ws"): Request {
  return new Request(url, { headers });
}

describe("extractWSAuth", () => {
  it("extracts token from Sec-WebSocket-Protocol header", () => {
    const req = makeRequest({ "Sec-WebSocket-Protocol": "bearer-abc123" });
    expect(extractWSAuth(req)).toBe("bearer-abc123");
  });

  it("extracts token from ?token= query param", () => {
    const req = makeRequest({}, "http://localhost/ws?token=jwt-xyz");
    expect(extractWSAuth(req)).toBe("jwt-xyz");
  });

  it("extracts token from cookie header", () => {
    const req = makeRequest({ Cookie: "token=session-abc; other=val" });
    expect(extractWSAuth(req)).toBe("session-abc");
  });

  it("extracts authorization cookie", () => {
    const req = makeRequest({ Cookie: "authorization=Bearer xyz" });
    expect(extractWSAuth(req)).toBe("Bearer xyz");
  });

  it("extracts session cookie", () => {
    const req = makeRequest({ Cookie: "session=sid-123" });
    expect(extractWSAuth(req)).toBe("sid-123");
  });

  it("returns undefined when no auth present", () => {
    const req = makeRequest();
    expect(extractWSAuth(req)).toBeUndefined();
  });

  it("prioritizes Sec-WebSocket-Protocol over query param", () => {
    const req = makeRequest(
      { "Sec-WebSocket-Protocol": "proto-token" },
      "http://localhost/ws?token=query-token",
    );
    expect(extractWSAuth(req)).toBe("proto-token");
  });

  it("prioritizes query param over cookie", () => {
    const req = makeRequest(
      { Cookie: "token=cookie-val" },
      "http://localhost/ws?token=query-val",
    );
    expect(extractWSAuth(req)).toBe("query-val");
  });
});
