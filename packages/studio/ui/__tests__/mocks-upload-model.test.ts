/**
 * How the Network tab reads and writes upload conditions and faults: the
 * types of file as a field shows them, sizes as the mock says them, the
 * presets with a value the mocks file set among them, every fault in the
 * catalogue and one it does not list, a route's own faults and upload
 * rules, and the tag that sums a route's override up.
 */
import { describe, expect, it } from "vitest";

import { FAULT_CATALOGUE, faultLook } from "@/features/mocks/fault-catalogue";
import { optionsWith } from "@/features/mocks/preset-options";
import { withFaults, withUploadRule } from "@/features/mocks/route-override-rules";
import { overrideRows } from "@/features/mocks/route-overrides";
import {
  limitsUploads,
  sizeLimitLabel,
  typesOf,
  typesText,
  uploadsOf,
} from "@/features/mocks/upload-conditions";
import { readNetworkConfig } from "@/store/payload/read-network-config";
import { readUploads } from "@/store/payload/read-uploads";
import { mockServer } from "./mock-server-fixture";

describe("the types of file an upload may hold", () => {
  it("are typed as <input accept> lists them, at commas and spaces", () => {
    expect(typesOf("image/*, .pdf  .csv,,")).toEqual(["image/*", ".pdf", ".csv"]);
    expect(typesOf("   ")).toEqual([]);
    expect(typesText(["image/*", ".pdf"])).toBe("image/*, .pdf");
    expect(typesText(undefined)).toBe("");
  });
});

describe("a size limit", () => {
  it("is said as the mock says it in its refusals", () => {
    expect([102_400, 1_048_576, 5_242_880, 2_621_440].map(sizeLimitLabel)).toEqual([
      "100 KB",
      "1 MB",
      "5 MB",
      "2.5 MB",
    ]);
  });
});

describe("a mock's upload conditions", () => {
  it("are none until it holds some, and limit uploads once one is set", () => {
    expect(uploadsOf(mockServer())).toEqual({});
    expect(limitsUploads({})).toBe(false);
    expect(limitsUploads({ accept: [] })).toBe(false);
    expect(limitsUploads({ maxBytes: 1024 })).toBe(true);
    expect(limitsUploads({ bandwidth: 512 })).toBe(true);
  });

  it("are read from the mock's report, each part checked for its shape", () => {
    expect(readUploads({ bandwidth: 1_500, maxBytes: 1024, accept: ["image/*"] })).toEqual({
      bandwidth: 1_500,
      maxBytes: 1024,
      accept: ["image/*"],
    });
    expect(readUploads({})).toEqual({});
    expect(readUploads({ maxBytes: "1 MB" })).toBeUndefined();
    expect(readUploads({ accept: [1] })).toBeUndefined();
  });

  it("come with the network settings, a route's own size limit and types with it", () => {
    const config = readNetworkConfig({
      latency: 0,
      errorRate: 0,
      uploads: { bandwidth: 512 },
      routeOverrides: [
        { routeId: "users:avatar", enabled: true, uploads: { maxBytes: 1024, bandwidth: 64 } },
      ],
    });

    expect(config?.uploads).toEqual({ bandwidth: 512 });
    expect(config?.routeOverrides).toEqual([
      { routeId: "users:avatar", enabled: true, uploads: { maxBytes: 1024 } },
    ]);
  });
});

describe("a setting's presets", () => {
  it("hold the value in force in its place when it is none of them", () => {
    const options = optionsWith([0, 512, 1_500], 750, (kbps) => `${kbps}`);

    expect(options.map((o) => o.value)).toEqual(["0", "512", "750", "1500"]);
    expect(optionsWith([0, 512], 512, String)).toHaveLength(2);
  });
});

describe("the faults a mock can inject", () => {
  it("are listed once each, server errors, client errors, then the connection's", () => {
    const types = FAULT_CATALOGUE.map((look) => look.type);

    expect(new Set(types).size).toBe(types.length);
    expect(types).toEqual(expect.arrayContaining(["413", "415", "429", "401", "interrupt"]));
    expect(FAULT_CATALOGUE.map((look) => look.group)).toEqual(
      [...FAULT_CATALOGUE.map((look) => look.group)].sort(
        (a, b) =>
          ["server", "client", "connection"].indexOf(a) -
          ["server", "client", "connection"].indexOf(b),
      ),
    );
  });

  it("name a status the catalogue does not list by its number and class", () => {
    expect(faultLook("413")).toMatchObject({ label: "HTTP 413", sub: "Content too large" });
    expect(faultLook("418")).toMatchObject({ label: "HTTP 418", group: "client" });
    expect(faultLook("599")).toMatchObject({ label: "HTTP 599", group: "server" });
  });
});

describe("a route's own faults and upload rules", () => {
  it("fail it with the faults given, at 100% when nothing would fail it", () => {
    const off = { routeId: "files:upload", enabled: false };

    expect(withFaults(off, ["413"], 0)).toEqual({
      routeId: "files:upload",
      enabled: true,
      faultTypes: ["413"],
      errorRate: 1,
    });
    expect(withFaults({ ...off, errorRate: 0.25 }, ["413"], 0).errorRate).toBe(0.25);
    expect(withFaults(off, ["413"], 0.1).errorRate).toBeUndefined();
  });

  it("go back to the mix with no faults, the override off when it sets nothing else", () => {
    const failing = { routeId: "files:upload", enabled: true, faultTypes: ["413"] };

    expect(withFaults(failing, [], 0)).toEqual({ routeId: "files:upload", enabled: false });
  });

  it("set a size limit and types one at a time, and take each back alone", () => {
    const limited = withUploadRule({ routeId: "users:avatar", enabled: false }, "maxBytes", 1024);
    const typed = withUploadRule(limited, "accept", ["image/*"]);

    expect(typed).toEqual({
      routeId: "users:avatar",
      enabled: true,
      uploads: { maxBytes: 1024, accept: ["image/*"] },
    });
    expect(withUploadRule(typed, "maxBytes", undefined)).toEqual({
      routeId: "users:avatar",
      enabled: true,
      uploads: { accept: ["image/*"] },
    });
    expect(
      withUploadRule(withUploadRule(typed, "maxBytes", undefined), "accept", undefined),
    ).toEqual({ routeId: "users:avatar", enabled: false });
  });

  it("are summed up in the route's tag", () => {
    const server = mockServer({
      routes: [
        {
          group: "users",
          endpoint: "avatar",
          httpMethod: "post",
          path: "/avatar",
          fullPath: "/api/users/avatar",
          source: "auto",
          hits: 0,
          avgLatency: 0,
        },
      ],
      networkConfig: {
        latency: 0,
        errorRate: 0,
        routeOverrides: [
          {
            routeId: "users:avatar",
            enabled: true,
            errorRate: 1,
            faultTypes: ["413", "415"],
            uploads: { maxBytes: 1_048_576, accept: ["image/*"] },
          },
        ],
      },
    });

    expect(overrideRows(server)[0]).toMatchObject({
      tag: "100% · 413, 415 · ≤ 1 MB · image/*",
      tone: "err",
    });
  });
});
