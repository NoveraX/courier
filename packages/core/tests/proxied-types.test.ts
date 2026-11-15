/**
 * A page's call through the proxy is typed with what reaches the page: the
 * proxy sends what the endpoint gave on as JSON, so a value JSON keeps whole
 * is typed as it was declared, and any other as JSON gives it back — a Date
 * as its string, a Set as an empty object — while bytes, a Blob and a
 * FormData, which the proxy sends as themselves, are typed as the page
 * reads them back.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import { courier, defineApi, type Proxied } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { createProxyCaller } from "../src/proxy-caller";
import type { Subscription } from "../src/realtime/subscription-types";

interface User {
  readonly id: string;
  name?: string;
  tags: string[];
}

interface Comment {
  id: string;
  replies: Comment[];
}

interface Thread {
  at: Date;
  replies: Thread[];
}

class Money {
  constructor(readonly amount: number) {}
  format(): string {
    return `${this.amount} €`;
  }
}

describe("a value as a page receives it through the proxy", () => {
  it("is its own type where JSON keeps it whole, by its name, a recursive one too", () => {
    expectTypeOf<Proxied<User>>().toEqualTypeOf<User>();
    expectTypeOf<Proxied<Comment>>().toEqualTypeOf<Comment>();
    expectTypeOf<Proxied<Array<User | null>>>().toEqualTypeOf<Array<User | null>>();
    expectTypeOf<Proxied<"a" | 1 | true>>().toEqualTypeOf<"a" | 1 | true>();
  });

  it("is what JSON writes of a value, its toJSON asked first", () => {
    expectTypeOf<Proxied<Date>>().toEqualTypeOf<string>();
    expectTypeOf<Proxied<{ at: Date; seen?: Date }>>().toEqualTypeOf<{
      at: string;
      seen?: string;
    }>();
    expectTypeOf<Proxied<{ toJSON(): { at: Date } }>>().toEqualTypeOf<{ at: string }>();
    expectTypeOf<
      Proxied<Thread>["replies"][number]["replies"][number]["at"]
    >().toEqualTypeOf<string>();
    expectTypeOf<Proxied<Set<string> | Map<string, number>>>().toEqualTypeOf<
      Record<string, never>
    >();
  });

  it("leaves out of an object what JSON does not write, and writes it as null in a list", () => {
    expectTypeOf<Proxied<Money>>().toEqualTypeOf<{ readonly amount: number }>();
    expectTypeOf<Proxied<{ id: string; gone: undefined }>>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<Proxied<Array<Date | undefined>>>().toEqualTypeOf<Array<string | null>>();
    expectTypeOf<Proxied<[Date, () => void]>>().toEqualTypeOf<[string, null]>();
  });

  it("is null for an answer of nothing, and nothing for a bigint, which JSON does not write", () => {
    expectTypeOf<Proxied<User | undefined>>().toEqualTypeOf<User | null>();
    expectTypeOf<Proxied<bigint>>().toEqualTypeOf<never>();
    expectTypeOf<Proxied<{ count: bigint }>>().toEqualTypeOf<{ count: never }>();
  });

  it("is bytes, a Blob or a FormData as the page reads each back, the proxy sending them as they are", () => {
    expectTypeOf<Proxied<Uint8Array>>().toEqualTypeOf<ArrayBuffer>();
    expectTypeOf<Proxied<ArrayBuffer>>().toEqualTypeOf<ArrayBuffer>();
    expectTypeOf<Proxied<File>>().toEqualTypeOf<Blob>();
    expectTypeOf<Proxied<FormData>>().toEqualTypeOf<FormData>();
  });

  it("is any, unknown and void as they are, which say nothing of the value", () => {
    expectTypeOf<Proxied<unknown>>().toEqualTypeOf<unknown>();
    expectTypeOf<Proxied<any>>().toBeAny();
    expectTypeOf<Proxied<void>>().toEqualTypeOf<void>();
  });
});

describe("a page's proxy client", () => {
  const { endpoint, stream } = courier();
  const api = defineApi({
    baseURL: "https://upstream.example",
    expose: true,
    endpoints: {
      user: endpoint.get("user").response<User>(),
      visit: endpoint
        .get("visit")
        .response<{ id: string }>()
        .map((visit) => ({ ...visit, at: new Date(0), pages: new Set(["/"]) })),
      ticks: stream.get("ticks").response<{ at: Date }>(),
    },
  });

  it("answers each call, and tells each event, as it reaches the page", () => {
    const typeOnly = () => {
      const page = createProxyCaller(routesOf(api, "api"));

      expectTypeOf(page.user).returns.resolves.toEqualTypeOf<User>();
      expectTypeOf(page.visit).returns.resolves.toEqualTypeOf<{
        id: string;
        at: string;
        pages: Record<string, never>;
      }>();
      expectTypeOf(page.raw.visit)
        .returns.resolves.toHaveProperty("data")
        .toHaveProperty("at")
        .toEqualTypeOf<string>();
      expectTypeOf(page.ticks).returns.toEqualTypeOf<Subscription<{ at: string }>>();
    };
    expect(typeOnly).toBeTypeOf("function");
  });
});
