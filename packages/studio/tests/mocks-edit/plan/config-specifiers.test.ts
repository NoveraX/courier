import { describe, expect, it } from "vitest";

import { configSpecifiers } from "../../../src/server/mocks-edit/plan/config-specifiers";

describe("configSpecifiers", () => {
  it("imports a .ts config without its extension, accepting .ts and .js", () => {
    expect(configSpecifiers("courier.config.ts", false)).toEqual({
      preferred: "./courier.config",
      accepted: ["./courier.config", "./courier.config.ts", "./courier.config.js"],
      form: "default",
    });
  });

  it("imports an .mts config through .mjs, accepting .mts", () => {
    expect(configSpecifiers("courier.config.mts", false)).toEqual({
      preferred: "./courier.config.mjs",
      accepted: ["./courier.config.mjs", "./courier.config.mts"],
      form: "default",
    });
  });

  it("imports an .mjs config by its own name", () => {
    expect(configSpecifiers("courier.config.mjs", false)).toEqual({
      preferred: "./courier.config.mjs",
      accepted: ["./courier.config.mjs"],
      form: "default",
    });
  });

  it("imports a .js config by its own name, accepting it without the extension", () => {
    expect(configSpecifiers("courier.config.js", false)).toEqual({
      preferred: "./courier.config.js",
      accepted: ["./courier.config.js", "./courier.config"],
      form: "default",
    });
  });

  it("imports a .cts config through .cjs, accepting .cts and no extension", () => {
    expect(configSpecifiers("courier.config.cts", false)).toEqual({
      preferred: "./courier.config.cjs",
      accepted: ["./courier.config.cjs", "./courier.config.cts", "./courier.config"],
      form: "default",
    });
  });

  it("imports a .cjs config by its own name, accepting it without the extension", () => {
    expect(configSpecifiers("courier.config.cjs", false)).toEqual({
      preferred: "./courier.config.cjs",
      accepted: ["./courier.config.cjs", "./courier.config"],
      form: "default",
    });
  });

  it("imports a config of any other name by that name", () => {
    expect(configSpecifiers("courier.config", false)).toEqual({
      preferred: "./courier.config",
      accepted: ["./courier.config"],
      form: "default",
    });
  });
});

describe("configSpecifiers where the project names extensions", () => {
  it("imports a .ts config through the .js it runs as, accepting the same specifiers", () => {
    expect(configSpecifiers("courier.config.ts", true)).toEqual({
      preferred: "./courier.config.js",
      accepted: ["./courier.config", "./courier.config.ts", "./courier.config.js"],
      form: "default",
    });
  });

  it.each([
    ["courier.config.mts", "./courier.config.mjs"],
    ["courier.config.cts", "./courier.config.cjs"],
    ["courier.config.js", "./courier.config.js"],
    ["courier.config.mjs", "./courier.config.mjs"],
    ["courier.config.cjs", "./courier.config.cjs"],
    ["courier.config", "./courier.config"],
  ])("imports %s as %s, as it does anyway", (configName, preferred) => {
    expect(configSpecifiers(configName, true)).toEqual(configSpecifiers(configName, false));
    expect(configSpecifiers(configName, true).preferred).toBe(preferred);
  });

  it("carries the form the config is imported in", () => {
    expect(configSpecifiers("courier.config.ts", false, "namespace").form).toBe("namespace");
  });
});
