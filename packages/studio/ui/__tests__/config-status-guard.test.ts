/**
 * `isConfigStatusPayload` is the UI's trust boundary for `config:status`:
 * the store and the APIs page rely on every field of the state it declares.
 */

import { describe, expect, it } from "vitest";

import { isConfigStatusPayload } from "../src/socket/config-status-guard";

const LOADED = { state: "loaded", revision: 3, configFile: "courier.config.ts", loadedAt: 1_000 };
const FAILED = {
  state: "failed",
  revision: 4,
  configFile: "courier.config.ts",
  error: { code: "CONFIG_INVALID", message: "Unexpected token in courier.config.ts" },
  failedAt: 2_000,
  lastGoodAt: 1_000,
};

describe("isConfigStatusPayload", () => {
  it("accepts a status sent while Studio starts", () => {
    expect(isConfigStatusPayload({ state: "starting", revision: 0 })).toBe(true);
  });

  it("accepts a config that loaded", () => {
    expect(isConfigStatusPayload(LOADED)).toBe(true);
  });

  it("accepts a config that fails, with and without a last good load", () => {
    expect(isConfigStatusPayload(FAILED)).toBe(true);
    expect(isConfigStatusPayload({ ...FAILED, configFile: null, lastGoodAt: null })).toBe(true);
  });

  it("accepts a config that is missing, with and without a last good load", () => {
    expect(
      isConfigStatusPayload({ state: "missing", revision: 1, configFile: null, lastGoodAt: null }),
    ).toBe(true);
    expect(
      isConfigStatusPayload({
        state: "missing",
        revision: 5,
        configFile: "courier.config.mjs",
        lastGoodAt: 1_000,
      }),
    ).toBe(true);
  });

  it("rejects anything that is not a plain object", () => {
    expect(isConfigStatusPayload(null)).toBe(false);
    expect(isConfigStatusPayload(undefined)).toBe(false);
    expect(isConfigStatusPayload("loaded")).toBe(false);
    expect(isConfigStatusPayload([LOADED])).toBe(false);
  });

  it("rejects a payload that carries a prototype key", () => {
    const tampered = JSON.parse(
      '{"state":"missing","revision":1,"configFile":null,"lastGoodAt":null,"__proto__":{"polluted":true}}',
    );

    expect(isConfigStatusPayload(tampered)).toBe(false);
  });

  it("rejects a state the UI does not know", () => {
    expect(isConfigStatusPayload({ ...LOADED, state: "settling" })).toBe(false);
    expect(isConfigStatusPayload({ revision: 1, lastGoodAt: null })).toBe(false);
  });

  it("rejects a starting status with a revision of its own", () => {
    expect(isConfigStatusPayload({ state: "starting", revision: 1 })).toBe(false);
    expect(isConfigStatusPayload({ state: "starting" })).toBe(false);
  });

  it("rejects an outcome whose revision is not a positive whole number", () => {
    expect(isConfigStatusPayload({ ...LOADED, revision: 0 })).toBe(false);
    expect(isConfigStatusPayload({ ...LOADED, revision: 1.5 })).toBe(false);
    expect(isConfigStatusPayload({ ...LOADED, revision: "3" })).toBe(false);
    expect(isConfigStatusPayload({ ...FAILED, revision: -1 })).toBe(false);
  });

  it("rejects a loaded status without its file or its time", () => {
    expect(isConfigStatusPayload({ ...LOADED, configFile: null })).toBe(false);
    expect(isConfigStatusPayload({ ...LOADED, loadedAt: "12:00" })).toBe(false);
    expect(isConfigStatusPayload({ ...LOADED, loadedAt: Number.NaN })).toBe(false);
  });

  it("rejects a failed status whose error or times are malformed", () => {
    expect(isConfigStatusPayload({ ...FAILED, error: "boom" })).toBe(false);
    expect(isConfigStatusPayload({ ...FAILED, error: { code: "X" } })).toBe(false);
    expect(isConfigStatusPayload({ ...FAILED, error: { code: 1, message: "m" } })).toBe(false);
    expect(isConfigStatusPayload({ ...FAILED, configFile: 42 })).toBe(false);
    expect(isConfigStatusPayload({ ...FAILED, failedAt: null })).toBe(false);
    expect(isConfigStatusPayload({ ...FAILED, lastGoodAt: undefined })).toBe(false);
  });

  it("rejects a missing status whose file or last good time is malformed", () => {
    const missing = { state: "missing", revision: 1, configFile: null, lastGoodAt: null };

    expect(isConfigStatusPayload({ state: "missing", revision: 1, configFile: null })).toBe(false);
    expect(isConfigStatusPayload({ ...missing, lastGoodAt: "1000" })).toBe(false);
    expect(isConfigStatusPayload({ state: "missing", revision: 1, lastGoodAt: null })).toBe(false);
    expect(isConfigStatusPayload({ ...missing, configFile: 42 })).toBe(false);
  });
});
