/**
 * The names a definition or a client keeps for itself.
 *
 * `options` holds a group's or a source's settings beside its endpoints.
 * `raw` and `with` are what a client answers with its own accessors — at
 * its root, on every group and on every flat endpoint — so a group or an
 * endpoint of either name type-checked and could never be reached.
 */
import { describe, expect, it } from "vitest";

import { courier, defineApi, defineGroup } from "../src/define/index";
import { ConfigurationError } from "../src/errors";

const { endpoint } = courier();

function refusal(define: () => unknown): unknown {
  try {
    define();
  } catch (error) {
    return error;
  }
  return undefined;
}

function expectRefused(error: unknown, name: string): void {
  expect(error).toBeInstanceOf(ConfigurationError);
  expect((error as ConfigurationError).code).toBe("RESERVED_ENDPOINT_NAME");
  expect((error as ConfigurationError).message).toContain(`"${name}"`);
}

describe("an endpoint named options", () => {
  it("is refused in a group, which keeps its prefix under that name", () => {
    const error = refusal(() =>
      defineGroup({
        prefix: "settings",
        // @ts-expect-error the name holds the group's settings
        endpoints: { options: endpoint.get("options"), list: endpoint.get("list") },
      }),
    );

    expectRefused(error, "options");
  });

  it("is refused among a source's own endpoints, which keep its baseURL under that name", () => {
    const error = refusal(() =>
      // @ts-expect-error the name holds the source's settings
      defineApi({
        baseURL: "https://api.example.com",
        endpoints: { options: endpoint.get("options") },
      }),
    );

    expectRefused(error, "options");
  });

  it("does not stop a group from reaching a path called options", () => {
    const settings = defineGroup({
      prefix: "settings",
      endpoints: { getOptions: endpoint.get("options") },
    });

    expect(settings.options).toEqual({ prefix: "settings" });
  });
});

describe("an endpoint named like a client accessor", () => {
  it("is refused in a group as raw, and the message names the accessor", () => {
    const error = refusal(() =>
      defineGroup({
        prefix: "files",
        // @ts-expect-error a client answers raw itself
        endpoints: { raw: endpoint.get(":id/raw").variables<{ id: string }>() },
      }),
    );

    expectRefused(error, "raw");
    expect((error as ConfigurationError).message).toContain(".raw");
    expect((error as ConfigurationError).message).toContain('"getRaw"');
  });

  it("is refused in a group as with", () => {
    const error = refusal(() =>
      defineGroup({
        prefix: "files",
        // @ts-expect-error a client answers with itself
        endpoints: { with: endpoint.get("with"), list: endpoint.get("") },
      }),
    );

    expectRefused(error, "with");
    expect((error as ConfigurationError).message).toContain(".with()");
  });

  it.each(["raw", "with"])("is refused among a source's own endpoints as %s", (name) => {
    const error = refusal(() =>
      defineApi({
        baseURL: "https://api.example.com",
        endpoints: { [name]: endpoint.get(name) },
      }),
    );

    expectRefused(error, name);
  });

  it("is refused at the type level among a source's own endpoints", () => {
    const typeOnly = () =>
      // @ts-expect-error a client answers raw itself
      defineApi({ baseURL: "https://api.example.com", endpoints: { raw: endpoint.get("raw") } });

    expect(typeOnly).toBeTypeOf("function");
  });
});

describe("a group named like a client accessor", () => {
  const files = defineGroup({ prefix: "files", endpoints: { list: endpoint.get("") } });

  it.each(["raw", "with"])("is refused as %s", (name) => {
    const error = refusal(() =>
      defineApi({ baseURL: "https://api.example.com", groups: { [name]: files } }),
    );

    expectRefused(error, name);
    expect((error as ConfigurationError).message).toContain(`"${name}Group"`);
  });

  it("is refused at the type level, with or without flat endpoints", () => {
    const typeOnly = () => {
      // @ts-expect-error a client answers raw itself
      defineApi({ baseURL: "https://api.example.com", groups: { raw: files } });
      // @ts-expect-error a client answers with itself
      defineApi({
        baseURL: "https://api.example.com",
        groups: { with: files },
        endpoints: { ping: endpoint.get("ping") },
      });
    };

    expect(typeOnly).toBeTypeOf("function");
  });

  it("is accepted under any other name", () => {
    const api = defineApi({ baseURL: "https://api.example.com", groups: { rawFiles: files } });

    expect(Object.keys(api.options.groups)).toEqual(["rawFiles"]);
  });
});
