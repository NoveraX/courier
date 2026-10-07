import { describe, expect, it } from "vitest";

import type { IncomingRequest } from "../../src/session/incoming-request";
import { writeRefusal } from "../../src/session/write-guard";

function incoming(method: string, headers: Record<string, string>): IncomingRequest {
  return { key: {}, method, origin: "https://app.example.com", headers: new Headers(headers) };
}

describe("writeRefusal — a form, a Server Action or a fetch", () => {
  it("lets the application's own pages write", () => {
    expect(writeRefusal(incoming("POST", { "sec-fetch-site": "same-origin" }))).toBeUndefined();
    expect(writeRefusal(incoming("POST", { origin: "https://app.example.com" }))).toBeUndefined();
  });

  it("lets a caller that is no browser write", () => {
    expect(writeRefusal(incoming("POST", {}))).toBeUndefined();
  });

  it("refuses a page on another site", () => {
    const reason = writeRefusal(
      incoming("POST", { "sec-fetch-site": "cross-site", origin: "https://evil.example" }),
    );

    expect(reason).toBe("it came from https://evil.example, not one of the application's pages");
  });

  it("refuses another origin an older browser names", () => {
    expect(writeRefusal(incoming("POST", { origin: "https://evil.example" }))).toContain(
      "evil.example",
    );
  });

  it("admits an origin the session lists", () => {
    const request = incoming("POST", {
      "sec-fetch-site": "same-site",
      origin: "https://www.example.com",
    });

    expect(writeRefusal(request, ["https://www.example.com"])).toBeUndefined();
  });
});

describe("writeRefusal — a page", () => {
  it("lets a page the application linked to, or the user opened, write", () => {
    expect(writeRefusal(incoming("GET", { "sec-fetch-site": "same-origin" }))).toBeUndefined();
    expect(writeRefusal(incoming("GET", { "sec-fetch-site": "none" }))).toBeUndefined();
  });

  it("refuses a page another site linked to", () => {
    expect(writeRefusal(incoming("GET", { "sec-fetch-site": "cross-site" }))).toBe(
      "a page on another site may have requested it (Sec-Fetch-Site: cross-site)",
    );
    expect(writeRefusal(incoming("GET", { "sec-fetch-site": "same-site" }))).toContain("same-site");
  });

  it("lets an older browser write when it names a page of the application as its referer", () => {
    expect(
      writeRefusal(incoming("GET", { referer: "https://app.example.com/inbox?x=1" })),
    ).toBeUndefined();
  });

  it("refuses an older browser that names another site, or no page at all", () => {
    expect(writeRefusal(incoming("GET", { referer: "https://evil.example/page" }))).toBe(
      "the page that requested it is on https://evil.example",
    );
    expect(writeRefusal(incoming("GET", {}))).toBe("nothing says which page requested it");
  });

  it("reads HEAD as a page", () => {
    expect(writeRefusal(incoming("HEAD", { "sec-fetch-site": "cross-site" }))).toContain(
      "another site",
    );
  });
});
