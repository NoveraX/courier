/**
 * Adopting the app's origin from the requests it serves.
 *
 * Adapters keep trying until a request carries a host, so a host-less probe
 * that happens to come first does not leave the origin unset for the life of
 * the process, nor Studio Playground proxy mode failing on one deployment and
 * not another.
 */
import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { discoverAppOrigin, getAppOrigin, setAppOrigin } from "../src/app-origin";
import { discoverNodeAppOrigin } from "../src/node";

afterEach(() => {
  setAppOrigin(undefined);
});

function nodeRequest(host: string | undefined): IncomingMessage {
  return {
    headers: host === undefined ? {} : { host },
    socket: { encrypted: false, remoteAddress: "203.0.113.9" },
  } as unknown as IncomingMessage;
}

describe("discoverAppOrigin", () => {
  it("adopts the first origin a request carries", () => {
    discoverAppOrigin("http://app.local:3000");

    expect(getAppOrigin()).toBe("http://app.local:3000");
  });

  it("keeps the origin that was configured", () => {
    setAppOrigin("https://configured.example");

    discoverAppOrigin("http://app.local:3000");

    expect(getAppOrigin()).toBe("https://configured.example");
  });

  it("ignores an opaque origin", () => {
    discoverAppOrigin("null");

    expect(getAppOrigin()).toBeUndefined();
  });
});

describe("discoverNodeAppOrigin", () => {
  it("is not spent by a request that carries no host", () => {
    discoverNodeAppOrigin(nodeRequest(undefined));
    discoverNodeAppOrigin(nodeRequest("app.local:3000"));

    expect(getAppOrigin()).toBe("http://app.local:3000");
  });
});
