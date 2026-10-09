/**
 * The status bar's words for Studio's connection: what is attached and
 * what it serves — an app in the browser that calls its APIs directly is
 * said to, rather than read as serving nothing.
 */
import { describe, expect, it } from "vitest";

import { connectionLabel } from "@/shell/status-bar/connection-label";

const SERVER = { runtimeId: "next-server", kind: "server" as const };
const BROWSER = { runtimeId: "vite-browser", kind: "browser" as const };

describe("connectionLabel", () => {
  it("counts the runtimes attached and the sources they serve", () => {
    expect(
      connectionLabel("connected", {
        runtimeCount: 2,
        sourceCount: 1,
        runtimes: [SERVER, BROWSER],
      }),
    ).toBe("2 runtimes · 1 source");
  });

  it("says an app in the browser alone calls its APIs directly, rather than serving no source", () => {
    expect(
      connectionLabel("connected", { runtimeCount: 1, sourceCount: 0, runtimes: [BROWSER] }),
    ).toBe("1 runtime · direct calls");
  });

  it("keeps a server that serves no source at 0 sources, which its setup should look into", () => {
    expect(
      connectionLabel("connected", { runtimeCount: 1, sourceCount: 0, runtimes: [SERVER] }),
    ).toBe("1 runtime · 0 sources");
  });

  it("says what Studio waits for, or does, while nothing is attached", () => {
    const none = { runtimeCount: 0, sourceCount: 0, runtimes: [] };

    expect(connectionLabel("connected", none)).toBe("waiting for an app");
    expect(connectionLabel("reconnecting", none)).toBe("reconnecting…");
    expect(connectionLabel("connecting", none)).toBe("connecting…");
    expect(connectionLabel("disconnected", none)).toBe("disconnected");
  });
});
