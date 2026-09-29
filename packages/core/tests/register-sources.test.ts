/**
 * The source registry is process-global and read much later, by adapters, at
 * request time. A wrong value accepted here surfaces as a missing endpoint
 * somewhere else entirely, long after the call that caused it.
 */
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";

import { courier, defineApi } from "../src/define/index";
import { ConfigurationError } from "../src/errors/configuration-error";
import { _resetSourcesForTests, getSources, registerSources } from "../src/sources";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "https://example.com",
  endpoints: { list: endpoint.get("items").response<unknown>() },
});

afterEach(() => {
  _resetSourcesForTests();
});

describe("what registerSources accepts", () => {
  it("registers a dictionary of sources", () => {
    registerSources({ api });

    expect(Object.keys(getSources() ?? {})).toEqual(["api"]);
  });

  it("accepts a module namespace, and an object made in another realm", () => {
    const namespace = Object.assign(Object.create(null), { api });
    const otherRealm = runInNewContext("({})");
    otherRealm.api = api;

    registerSources(namespace);
    expect(Object.keys(getSources() ?? {})).toEqual(["api"]);
    registerSources(otherRealm);
    expect(Object.keys(getSources() ?? {})).toEqual(["api"]);
  });

  it("accepts an empty dictionary, which is a legitimate state", () => {
    registerSources({});

    expect(getSources()).toEqual({});
  });
});

describe("what it refuses", () => {
  const rejected: ReadonlyArray<readonly [string, unknown]> = [
    ["undefined", undefined],
    ["null", null],
    ["a string", "api"],
    ["a number", 7],
    ["an array", [api]],
    ["a Map", new Map([["api", api]])],
    ["a Promise", Promise.resolve({ api })],
    ["a Date", new Date(0)],
    ["a class instance", new (class Registry {})()],
  ];

  for (const [label, value] of rejected) {
    it(`refuses ${label} with a named error`, () => {
      expect(() => registerSources(value as never)).toThrow(ConfigurationError);
    });
  }

  it("names what it received rather than throwing from internals", () => {
    expect(() => registerSources(null as never)).toThrow(/received null/);
    expect(() => registerSources([] as never)).toThrow(/received an array/);
    expect(() => registerSources("api" as never)).toThrow(/received string/);
    expect(() => registerSources(new Map() as never)).toThrow(/received an instance of Map/);
    expect(() => registerSources(Promise.resolve({}) as never)).toThrow(
      /received a Promise — await it first/,
    );
  });

  it("carries a code a caller can branch on", () => {
    try {
      registerSources(undefined as never);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ConfigurationError).code).toBe("SOURCES_NOT_A_RECORD");
    }
  });

  /** A refused call must not half-register. */
  it("leaves the registry untouched", () => {
    registerSources({ api });

    expect(() => registerSources("nonsense" as never)).toThrow();
    expect(Object.keys(getSources() ?? {})).toEqual(["api"]);
  });
});
