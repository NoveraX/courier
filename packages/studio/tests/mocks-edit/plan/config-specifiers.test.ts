import { describe, expect, it } from "vitest";

import { configSpecifiers } from "../../../src/server/mocks-edit/plan/config-specifiers";

describe("configSpecifiers", () => {
  it("imports a .ts config without its extension, accepting .ts and .js", () => {
    expect(configSpecifiers("courier.config.ts")).toEqual({
      preferred: "./courier.config",
      accepted: ["./courier.config", "./courier.config.ts", "./courier.config.js"],
    });
  });

  it("imports an .mts config through .mjs, accepting .mts", () => {
    expect(configSpecifiers("courier.config.mts")).toEqual({
      preferred: "./courier.config.mjs",
      accepted: ["./courier.config.mjs", "./courier.config.mts"],
    });
  });

  it("imports an .mjs config by its own name", () => {
    expect(configSpecifiers("courier.config.mjs")).toEqual({
      preferred: "./courier.config.mjs",
      accepted: ["./courier.config.mjs"],
    });
  });

  it("imports a .js config by its own name, accepting it without the extension", () => {
    expect(configSpecifiers("courier.config.js")).toEqual({
      preferred: "./courier.config.js",
      accepted: ["./courier.config.js", "./courier.config"],
    });
  });

  it("imports a .cts config through .cjs, accepting .cts and no extension", () => {
    expect(configSpecifiers("courier.config.cts")).toEqual({
      preferred: "./courier.config.cjs",
      accepted: ["./courier.config.cjs", "./courier.config.cts", "./courier.config"],
    });
  });

  it("imports a .cjs config by its own name, accepting it without the extension", () => {
    expect(configSpecifiers("courier.config.cjs")).toEqual({
      preferred: "./courier.config.cjs",
      accepted: ["./courier.config.cjs", "./courier.config"],
    });
  });

  it("imports a config of any other name by that name", () => {
    expect(configSpecifiers("courier.config")).toEqual({
      preferred: "./courier.config",
      accepted: ["./courier.config"],
    });
  });
});
