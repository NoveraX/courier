/**
 * The headers a client's `auth` frame adds to the handshake, as the server
 * logs what it refuses: once a name it knows or a prefix, never once per
 * name a client makes up, and never in the client's own words.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as FrameCredentials from "../src/adapter/ws-frame-credentials";

/* Each check starts from a server that has refused nothing yet. */
async function freshModule(): Promise<typeof FrameCredentials> {
  vi.resetModules();
  return import("../src/adapter/ws-frame-credentials");
}

function framed(headers: Record<string, string>) {
  return { headers: Object.entries(headers), auth: undefined };
}

function invented(prefix: string, frame: number): Record<string, string> {
  const headers: Record<string, string> = {};
  for (let at = 0; at < 64; at++) headers[`${prefix}${frame}-${at}`] = "1";
  return headers;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("headers an auth frame may not add", () => {
  it("are refused, and said once a prefix however many names clients invent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { frameHeadersOver } = await freshModule();

    for (let frame = 0; frame < 50; frame++) {
      const added = frameHeadersOver(
        new Headers(),
        framed({ ...invented("sec-", frame), ...invented("x-forwarded-", frame) }),
      );
      expect(added?.has(`sec-${frame}-0`)).toBe(false);
    }

    const said = warn.mock.calls.map((call) => call.join(" "));
    expect(said).toHaveLength(2);
    expect(said.join("\n")).toContain("sec-* header is not taken");
    expect(said.join("\n")).toContain("x-forwarded-* header is not taken");
  });

  it("are said by the name the server knows, never in the client's own words", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { frameHeadersOver } = await freshModule();

    frameHeadersOver(new Headers(), framed({ "sec-forged-by-a-client": "1", cookie: "a=1" }));

    const said = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(said).not.toMatch(/forged/i);
    expect(said).toContain("sec-* header is not taken");
    expect(said).toContain("cookie header is not taken");
  });

  it("are not read from a payload whose names or values HTTP cannot carry", async () => {
    const { frameCredentials } = await freshModule();

    expect(frameCredentials({ headers: { "x-bad name": "1" } })).toBeUndefined();
    expect(frameCredentials({ headers: { "sec-\u001b[2J\nforged": "1" } })).toBeUndefined();
    expect(
      frameCredentials({ headers: { authorization: "Bearer t1\r\nx-evil: 1" } }),
    ).toBeUndefined();
    expect(frameCredentials({ headers: { authorization: "Bearer t1" } })?.headers).toEqual([
      ["authorization", "Bearer t1"],
    ]);
  });

  it("refuse a frame with a header HTTP cannot carry, said once and without the header", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { frameHeadersOver } = await freshModule();

    const first = frameHeadersOver(new Headers(), framed({ "x-bad name": "1" }));
    const second = frameHeadersOver(new Headers(), framed({ "x-also bad": "1" }));

    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    const said = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(said).toContain("An auth frame carried a header HTTP cannot");
    expect(said).not.toContain("bad name");
  });

  it("keep what a browser could not put on the handshake", async () => {
    const { frameHeadersOver } = await freshModule();

    const added = frameHeadersOver(
      new Headers({ "user-agent": "browser" }),
      framed({ authorization: "Bearer t1", "user-agent": "frame" }),
    );

    expect(added?.get("authorization")).toBe("Bearer t1");
    expect(added?.get("user-agent")).toBe("browser");
  });
});
