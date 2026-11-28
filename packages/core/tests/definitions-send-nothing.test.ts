/**
 * A page that holds the definitions alone loads none of the code a call is
 * sent with: the `fetch` Courier makes of a source's own, and the check of
 * what it answers. Next.js keeps in a module every export any page of an
 * app uses, so a module the definitions load would bring such a page what
 * the app's callers take of it as well. A definition still refuses, as it
 * is made, a `fetch` that could not send.
 */
import { describe, expect, it, vi } from "vitest";

import { courier, defineApi, defineGroup } from "../src/define";

vi.mock("../src/http-client/source-transport", () => {
  throw new Error("The definitions loaded the code a call is sent with");
});

const { endpoint } = courier();

describe("a page of definitions alone", () => {
  it("defines its API without the code a call is sent with", () => {
    const users = defineGroup({
      prefix: "users",
      endpoints: { getAll: endpoint.get("").response() },
    });
    const api = defineApi({
      name: "shop",
      baseURL: "https://shop.example",
      fetch: globalThis.fetch,
      expose: true,
      groups: { users },
    });

    expect(api.options.groups.users).toBe(users);
  });

  it("refuses a fetch that is not a function without it", () => {
    const define = () =>
      defineApi({
        name: "shop",
        baseURL: "https://shop.example",
        fetch: "undici" as never,
        endpoints: {},
      });

    expect(define).toThrow(
      expect.objectContaining({
        code: "SOURCE_TRANSPORT_INVALID",
        message: "[courier] A source's fetch must be a function; it is string.",
      }),
    );
  });
});
