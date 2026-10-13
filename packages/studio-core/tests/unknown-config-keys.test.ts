/**
 * The keys of a courier.config that Courier does not read, named so that a
 * misspelt key — `studo:`, `server: { prot }` — is not ignored in silence,
 * the setting it meant keeping its default.
 */
import { describe, expect, it } from "vitest";

import { unknownConfigKeys } from "../src/runtime/unknown-config-keys";

describe("unknownConfigKeys", () => {
  it("names a key Courier does not read, at the top and in each block it reads", () => {
    const config = {
      sources: {},
      studo: { port: 6290 },
      studio: { prot: 6290, open: true },
      server: { port: 3001, maxbodybytes: 10 },
      runtime: { appOrigin: "http://localhost:3000", origin: "x" },
    };

    expect(unknownConfigKeys(config)).toEqual([
      "studo",
      "studio.prot",
      "server.maxbodybytes",
      "runtime.origin",
    ]);
  });

  it("names none in a config that holds only what Courier reads", () => {
    const config = {
      sources: {},
      imports: {},
      studio: {
        port: 6290,
        host: "127.0.0.1",
        mockBasePort: 7001,
        open: false,
        allowedSpecHosts: [],
      },
      server: {
        allowedOrigins: [],
        allowedHosts: [],
        maxBodyBytes: 1,
        maxUploadBytes: 1,
        rateLimit: { requests: 60, window: 60_000 },
        browsersOnly: true,
      },
      agents: { offer: "reads", allow: [], deny: [], access: "write", confirm: "write" },
    };

    expect(unknownConfigKeys(config)).toEqual([]);
  });

  it("names a misspelt key of the agents policy", () => {
    expect(unknownConfigKeys({ sources: {}, agents: { ofer: "reads", deny: [] } })).toEqual([
      "agents.ofer",
    ]);
  });

  it("reads nothing into a value that is not an object", () => {
    expect(unknownConfigKeys(null)).toEqual([]);
    expect(unknownConfigKeys({ sources: {}, studio: [1] })).toEqual([]);
  });
});
