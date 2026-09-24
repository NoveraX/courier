import { describe, expect, it, vi } from "vitest";

import { createOriginGuard } from "../src/server/origin-guard";
import { createStudioOriginPolicy } from "../src/server/studio-origin";

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
