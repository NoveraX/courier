/**
 * Where Studio listens by default, and the URL a client dials for a Studio
 * bound to a given host.
 *
 * Clients do not dial the bind host verbatim: `studio.host: "0.0.0.0"` would
 * send them to an address that cannot be dialled, and an IPv6 host would make
 * the invalid `http://::1:6280`.
 */
import { describe, expect, it } from "vitest";

import {
  formatStudioUrl,
  STUDIO_DEFAULT_HOST,
  STUDIO_DEFAULT_PORT,
  STUDIO_DEFAULT_URL,
} from "../src/config";

describe("the shared default address", () => {
  /** Both sides read the same name, so the resolver treats them alike. */
  it("is a name rather than a literal IP", () => {
    expect(STUDIO_DEFAULT_HOST).toBe("localhost");
    expect(STUDIO_DEFAULT_URL).toContain("localhost");
  });

  it("is the port the documentation promises", () => {
    expect(STUDIO_DEFAULT_PORT).toBe(6280);
    expect(STUDIO_DEFAULT_URL).toBe(`http://${STUDIO_DEFAULT_HOST}:${STUDIO_DEFAULT_PORT}`);
  });
});

describe("formatStudioUrl", () => {
  it("keeps a name or an IPv4 address as it is", () => {
    expect(formatStudioUrl("localhost", 6280)).toBe("http://localhost:6280");
    expect(formatStudioUrl("127.0.0.1", 7000)).toBe("http://127.0.0.1:7000");
    expect(formatStudioUrl("studio.internal", 80)).toBe("http://studio.internal:80");
  });

  it("dials localhost for a wildcard bind", () => {
    expect(formatStudioUrl("0.0.0.0", 6280)).toBe("http://localhost:6280");
    expect(formatStudioUrl("::", 6280)).toBe("http://localhost:6280");
  });

  it("brackets an IPv6 address once", () => {
    expect(formatStudioUrl("::1", 6280)).toBe("http://[::1]:6280");
    expect(formatStudioUrl("[::1]", 6280)).toBe("http://[::1]:6280");
    expect(formatStudioUrl("fd00::5", 6280)).toBe("http://[fd00::5]:6280");
  });
});
