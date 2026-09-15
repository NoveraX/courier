import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineBase } from "../src/define/base";
import type { InferResponse } from "../src/define/marker";
import { ENDPOINT_SCHEMA } from "../src/define/marker";
import type { Middleware } from "../src/middleware/types";

const UserSchema = z.object({ id: z.string(), email: z.string() });
const ById = z.object({ id: z.string() });
const CommandSchema = z.object({ type: z.literal("ping") });

interface Audit {
  readonly id: string;
}

function meta(endpoint: unknown): Record<string, unknown> {
  return (endpoint as { [ENDPOINT_SCHEMA]: Record<string, unknown> })[ENDPOINT_SCHEMA];
}

function options(endpoint: unknown): Record<string, unknown> {
  return (endpoint as { options: Record<string, unknown> }).options;
}

describe("defineBase", () => {
  const base = defineBase();

  describe("wire probing", () => {
    it("captures method and path from the closure", () => {
      const getUser = base.query.variables(ById).response(UserSchema).via((http, vars) =>
        http.get(":id", vars),
      );

      expect(getUser.method).toBe("get");
      expect(getUser.path).toBe(":id");
    });

    it("captures a bare path when the closure passes no variables", () => {
      const listUsers = base.query.response(UserSchema).via((http) => http.get(""));

      expect(listUsers.method).toBe("get");
      expect(listUsers.path).toBe("");
    });

    it("records the verb the vendor requires, not the declared semantics", () => {
      const search = base.query
        .variables(z.object({ q: z.string() }))
        .response(UserSchema)
        .via((http, vars) => http.post("search", vars));

      expect(search.method).toBe("post");
      expect(search.kind).toBe("query");
    });

    it("maps a channel connect onto a get for the wire shape", () => {
      const presence = base.channel
        .variables(z.object({ room: z.string() }))
        .response(UserSchema)
        .via((ws, vars) => ws.connect(":room/presence", vars));

      expect(presence.path).toBe(":room/presence");
      expect(presence.kind).toBe("channel");
    });

    it("rejects a closure that addresses nothing", () => {
      expect(() => base.query.response(UserSchema).via((() => ({})) as never)).toThrow(
        /made no wire call/,
      );
    });
  });

  describe("slots", () => {
    it("records the schemas it was given", () => {
      const createUser = base.mutation.variables(ById).response(UserSchema).via((http, vars) =>
        http.post("", vars),
      );

      expect(meta(createUser).response).toBe(UserSchema);
      expect(meta(createUser).variables).toBe(ById);
      expect(meta(createUser).kind).toBe("mutation");
    });

    it("produces the same descriptor whichever order the slots are filled", () => {
      const a = base.query.variables(ById).response(UserSchema).via((http, vars) =>
        http.get(":id", vars),
      );
      const b = base.query.response(UserSchema).variables(ById).via((http, vars) =>
        http.get(":id", vars),
      );

      expect(meta(a)).toEqual(meta(b));
      expect(a.method).toBe(b.method);
      expect(a.path).toBe(b.path);
    });

    it("carries no schema when only a type argument was given", () => {
      const listAudit = base.query
        .variables<{ since: string }>()
        .response<readonly Audit[]>()
        .via((http, vars) => http.get("audit", vars));

      expect(meta(listAudit).response).toBeUndefined();
      expect(meta(listAudit).variables).toBeUndefined();
      expect(listAudit.path).toBe("audit");
    });

    it("validates what is sent while leaving what is received untyped at runtime", () => {
      const impersonate = base.mutation
        .variables(ById)
        .response<{ token: string }>()
        .via((http, vars) => http.post(":id/impersonate", vars));

      expect(meta(impersonate).variables).toBe(ById);
      expect(meta(impersonate).response).toBeUndefined();
    });

    it("records a channel send schema", () => {
      const presence = base.channel
        .response(UserSchema)
        .send(CommandSchema)
        .via((ws) => ws.connect("presence"));

      expect(meta(presence).send).toBe(CommandSchema);
    });

    it("refuses a slot that was already filled", () => {
      expect(() => base.query.response(UserSchema).response(UserSchema)).toThrow(
        /\.response\(\) was called twice/,
      );
    });
  });

  describe("reuse", () => {
    it("lets a partially applied builder serve several endpoints", () => {
      const byId = base.query.variables(ById);

      const profile = byId.response(UserSchema).via((http, vars) => http.get(":id/profile", vars));
      const settings = byId.response(UserSchema).via((http, vars) => http.get(":id/settings", vars));

      expect(profile.path).toBe(":id/profile");
      expect(settings.path).toBe(":id/settings");
    });

    it("does not leak a setting from one endpoint into its sibling", () => {
      const shared = base.query.variables(ById);

      const slow = shared.timeout(30_000).response(UserSchema).via((http, vars) =>
        http.get(":id", vars),
      );
      const plain = shared.response(UserSchema).via((http, vars) => http.get(":id", vars));

      expect(options(slow).timeout).toBe(30_000);
      expect(options(plain).timeout).toBeUndefined();
    });
  });

  describe("inheritance", () => {
    const first: Middleware = { name: "first", phase: "before", handler: () => {} };
    const second: Middleware = { name: "second", phase: "before", handler: () => {} };
    const third: Middleware = { name: "third", phase: "before", handler: () => {} };

    it("applies base middleware to every endpoint built from it", () => {
      const vendor = defineBase({ middleware: [first], timeout: 10_000 });
      const endpoint = vendor.query.response(UserSchema).via((http) => http.get(""));

      expect(options(endpoint).middleware).toEqual([first]);
      expect(options(endpoint).timeout).toBe(10_000);
    });

    it("appends endpoint middleware after the inherited list", () => {
      const vendor = defineBase({ middleware: [first] });
      const endpoint = vendor.query.use(second).response(UserSchema).via((http) => http.get(""));

      expect(options(endpoint).middleware).toEqual([first, second]);
    });

    it("concatenates parent middleware first when extending", () => {
      const vendor = defineBase({ middleware: [first] });
      const admin = vendor.extend({ middleware: [second] });
      const endpoint = admin.query.use(third).response(UserSchema).via((http) => http.get(""));

      expect(options(endpoint).middleware).toEqual([first, second, third]);
    });

    it("replaces scalars rather than merging them when extending", () => {
      const vendor = defineBase({ timeout: 10_000 });
      const slow = vendor.extend({ timeout: 60_000 });
      const endpoint = slow.query.response(UserSchema).via((http) => http.get(""));

      expect(options(endpoint).timeout).toBe(60_000);
    });

    it("drops the inherited middleware when the endpoint opts out", () => {
      const vendor = defineBase({ middleware: [first] });
      const endpoint = vendor.query
        .response(UserSchema)
        .via((http) => http.get(""), { inherit: false });

      expect(options(endpoint).middleware).toEqual([]);
    });

    it("leaves the parent base untouched when it is extended", () => {
      const vendor = defineBase({ middleware: [first] });
      vendor.extend({ middleware: [second] });
      const endpoint = vendor.query.response(UserSchema).via((http) => http.get(""));

      expect(options(endpoint).middleware).toEqual([first]);
    });
  });

  describe("terminal options", () => {
    it("keeps kind specific options on the descriptor", () => {
      const feed = base.stream
        .variables(ById)
        .response(UserSchema)
        .via((sse, vars) => sse.get(":id/events", vars), {
          reconnect: { maxAttempts: 5, backoff: "exponential" },
          tags: ["activity"],
        });

      expect(options(feed).reconnect).toEqual({ maxAttempts: 5, backoff: "exponential" });
      expect(options(feed).tags).toEqual(["activity"]);
    });

    it("carries a cache config declared on a query", () => {
      const listUsers = base.query
        .response(UserSchema)
        .cache({ revalidate: 60 })
        .via((http) => http.get(""));

      expect(options(listUsers).cache).toEqual({ revalidate: 60 });
    });
  });
});

describe("type level guarantees", () => {
  const base = defineBase();

  it("finishes the chain at the terminal", () => {
    const endpoint = base.query.response(UserSchema).via((http) => http.get(""));

    function rejected(): void {
      // @ts-expect-error the terminal returns a descriptor, which carries no builder methods
      endpoint.response(UserSchema);
    }

    expect(rejected).toBeTypeOf("function");
    expect(endpoint.kind).toBe("query");
  });

  it("accepts a cache config on a query only", () => {
    const cached = base.query.response(UserSchema).cache({ revalidate: 60 });
    expect(cached).toBeDefined();

    function rejected(): void {
      // @ts-expect-error caching a write is rejected at the call site that wrote it
      base.mutation.response(UserSchema).cache({ revalidate: 60 });
    }

    expect(rejected).toBeTypeOf("function");
  });

  it("offers send on a channel only", () => {
    const channel = base.channel.response(UserSchema).send(CommandSchema);
    expect(channel).toBeDefined();

    function rejected(): void {
      // @ts-expect-error a stream has no send slot
      base.stream.response(UserSchema).send(CommandSchema);
    }

    expect(rejected).toBeTypeOf("function");
  });

  it("infers the response type from the schema", () => {
    const getUser = base.query.variables(ById).response(UserSchema).via((http, vars) =>
      http.get(":id", vars),
    );
    const sample: InferResponse<typeof getUser> = { id: "1", email: "a@b.c" };
    expect(sample.email).toBe("a@b.c");
  });

  it("infers a declared type when no schema was given", () => {
    const listAudit = base.query.response<readonly Audit[]>().via((http) => http.get("audit"));

    const sample: InferResponse<typeof listAudit> = [{ id: "1" }];
    expect(sample[0]?.id).toBe("1");
  });
});
