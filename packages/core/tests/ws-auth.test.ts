import { describe, expect, it } from "vitest";

import { extractWSAuth, validateOrigin } from "../src/adapter/ws-auth";

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

describe("validateOrigin", () => {
  it("allows all origins when allowedOrigins is undefined", () => {
    const req = makeRequest({ Origin: "http://evil.com" });
    expect(validateOrigin(req)).toBe(true);
  });

  it("allows all origins when allowedOrigins is empty", () => {
    const req = makeRequest({ Origin: "http://evil.com" });
    expect(validateOrigin(req, [])).toBe(true);
  });

  it("allows matching origin", () => {
    const req = makeRequest({ Origin: "http://localhost:3000" });
    expect(validateOrigin(req, ["http://localhost:3000"])).toBe(true);
  });

  it("rejects non-matching origin", () => {
    const req = makeRequest({ Origin: "http://evil.com" });
    expect(validateOrigin(req, ["http://localhost:3000"])).toBe(false);
  });

  it("rejects missing origin header when origins are restricted", () => {
    const req = makeRequest();
    expect(validateOrigin(req, ["http://localhost:3000"])).toBe(false);
  });

  it("supports multiple allowed origins", () => {
    const allowed = ["http://localhost:3000", "https://app.example.com"];
    const req = makeRequest({ Origin: "https://app.example.com" });
    expect(validateOrigin(req, allowed)).toBe(true);
  });
});
