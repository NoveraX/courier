/**
 * An API keeps the key the first entry point took it up under. Another
 * entry point that names it otherwise is refused, saying which took it up
 * first and under which key: the key came from that entry point, not from
 * a name given to `defineApi`. The same key again is no conflict, and
 * `registerSources`, which replaces the whole dictionary, may move an API
 * it took up itself to another key — a hot reload that renamed one.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createHandler } from "../../src/adapter";
import { defineApi, getSourceName } from "../../src/define";
import { courier } from "../../src/define/courier";
import { _resetSourcesForTests, registerSources } from "../../src/server/sources";

const { endpoint } = courier();

function catalog() {
  return defineApi({
    baseURL: "https://shop.example.com",
    endpoints: { list: endpoint.get("items") },
  });
}

afterEach(() => {
  _resetSourcesForTests();
});

describe("an API two entry points take up", () => {
  it("is refused under a second key, naming the entry point and the key that came first", () => {
    const api = catalog();
    registerSources({ api });

    let refused: unknown;
    try {
      createHandler({ sources: { catalog: api } });
    } catch (error) {
      refused = error;
    }

    expect(refused).toMatchObject({ code: "SOURCE_KEY_MISMATCH" });
    expect((refused as Error).message).toBe(
      [
        '[courier] createHandler takes up as "catalog" an API that registerSources took up as "api" first.',
        "",
        "The proxy and the routes module address a source by one key, so every entry point takes an",
        'API up under the same one: use "api" in createHandler too, or give it an API of its own.',
      ].join("\n"),
    );
    expect(getSourceName(api)).toBe("api");
  });

  it("is refused the same where an entry point takes it up again under another key", () => {
    const api = catalog();
    createHandler({ sources: { api } });

    expect(() => createHandler({ sources: { catalog: api } })).toThrow(
      'createHandler takes up as "catalog" an API that createHandler took up as "api" first.',
    );
  });

  it("moves to another key where registerSources takes it up again, a hot reload's", () => {
    const api = catalog();
    registerSources({ api });

    registerSources({ catalog: api });

    expect(getSourceName(api)).toBe("catalog");
    expect(() => createHandler({ sources: { catalog: api } })).not.toThrow();
    expect(() => createHandler({ sources: { api } })).toThrow(
      'createHandler takes up as "api" an API that registerSources took up as "catalog" first.',
    );
  });

  it("is refused where registerSources moves it off a name its author gave defineApi", () => {
    const api = defineApi({
      name: "api",
      baseURL: "https://shop.example.com",
      endpoints: { list: endpoint.get("items") },
    });
    registerSources({ api });

    expect(() => registerSources({ catalog: api })).toThrow(
      'Source key "catalog" conflicts with the name given to defineApi, "api".',
    );
    expect(getSourceName(api)).toBe("api");
  });

  it("stays refused where another entry point took it up first", () => {
    const api = catalog();
    createHandler({ sources: { api } });

    expect(() => registerSources({ catalog: api })).toThrow(
      'registerSources takes up as "catalog" an API that createHandler took up as "api" first.',
    );
  });

  it("takes it up again under the same key", () => {
    const api = catalog();
    registerSources({ api });

    expect(() => createHandler({ sources: { api } })).not.toThrow();
    expect(getSourceName(api)).toBe("api");
  });
});
