/**
 * The endpoint name a group or a source keeps for its own settings.
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

describe("an endpoint named options", () => {
  it("is refused in a group, which keeps its prefix under that name", () => {
    const error = refusal(() =>
      defineGroup({
        prefix: "settings",
        // @ts-expect-error the name holds the group's settings
        endpoints: { options: endpoint.get("options"), list: endpoint.get("list") },
      }),
    );

    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as ConfigurationError).code).toBe("RESERVED_ENDPOINT_NAME");
    expect((error as ConfigurationError).message).toMatch(/"options"/);
  });

  it("is refused among a source's own endpoints, which keep its baseURL under that name", () => {
    const error = refusal(() =>
      // @ts-expect-error the name holds the source's settings
      defineApi({
        baseURL: "https://api.example.com",
        endpoints: { options: endpoint.get("options") },
      }),
    );

    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as ConfigurationError).code).toBe("RESERVED_ENDPOINT_NAME");
  });

  it("does not stop a group from reaching a path called options", () => {
    const settings = defineGroup({
      prefix: "settings",
      endpoints: { getOptions: endpoint.get("options") },
    });

    expect(settings.options).toEqual({ prefix: "settings" });
  });
});
