import { describe, expect, it, vi } from "vitest";

import { createOriginGuard } from "../src/server/origin-guard";
import { createStudioOriginPolicy } from "../src/server/studio-origin";
import { validateSpecUrl } from "../src/server/validate-url";

function call(origin: string | undefined) {
  const guard = createOriginGuard(createStudioOriginPolicy({ bindHost: "localhost", extraOrigins: [] }));
  const next = vi.fn();
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const headers = { host: "localhost:6280", ...(origin === undefined ? {} : { origin }) };
  guard({ headers } as never, res as never, next);
  return { next, res };
}

describe("Studio's API", () => {
  it("answers its own UI", () => {
    const { next, res } = call("http://localhost:6280");

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("refuses a page on another site", () => {
    /* Studio listens on the developer's own machine, so every page they have
       open can reach it. */
    const { next, res } = call("https://evil.test");

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("refuses a sandboxed frame, which names no site", () => {
    const { next, res } = call("null");

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("answers a caller that is not a page at all", () => {
    /* curl, an editor, a script — a browser always names its origin when it
       calls across sites, so silence means this is not one. */
    const { next } = call(undefined);

    expect(next).toHaveBeenCalled();
  });
});

describe("a specification URL", () => {
  it("may point at this machine", async () => {
    /* Reading the spec from the project's own dev server is the ordinary
       case, and refusing it made importing by URL useless. */
    await expect(validateSpecUrl("http://localhost:3000/openapi.json")).resolves.toBeUndefined();
    await expect(validateSpecUrl("http://127.0.0.1:3000/openapi.json")).resolves.toBeUndefined();
  });

  it("may not wander into a private network", async () => {
    await expect(validateSpecUrl("http://10.0.0.7/spec.json")).rejects.toThrow(/private address/);
    await expect(validateSpecUrl("http://192.168.1.5/spec.json")).rejects.toThrow(/private address/);
    await expect(validateSpecUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      /private address/,
    );
  });

  it("may reach a private host the project named", async () => {
    await expect(
      validateSpecUrl("http://10.0.0.7:8080/spec.json", ["10.0.0.7:8080"]),
    ).resolves.toBeUndefined();
  });

  it("still refuses an address that means every interface", async () => {
    await expect(validateSpecUrl("http://0.0.0.0/spec.json")).rejects.toThrow(/unspecified/);
  });

  it("still requires http or https", async () => {
    await expect(validateSpecUrl("file:///etc/passwd")).rejects.toThrow(/protocol/);
  });
});
