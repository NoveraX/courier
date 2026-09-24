/**
 * The URL a client dials for a Studio bound to a given host.
 *
 * Clients used to dial the bind host verbatim, so `studio.host: "0.0.0.0"`
 * sent them to an address that cannot be dialled and an IPv6 host produced
 * the invalid `http://::1:6280`.
 */
import { describe, expect, it } from "vitest";

import { formatStudioUrl } from "../src/config";

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
