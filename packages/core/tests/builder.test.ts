import { describe, expect, it } from "vitest";
import { z } from "zod";
import { courier } from "../src/define/courier";
import type { InferResponse } from "../src/define/marker";
import { ENDPOINT_SCHEMA } from "../src/define/marker";
import type { ChannelProbe, HttpProbe, StreamProbe } from "../src/define/probe";
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

describe("courier", () => {
  const base = courier();

  describe("wire probing", () => {
    it("captures method and path from the closure", () => {
      const getUser = base.endpoint.variables(ById).response(UserSchema).get(":id");

      expect(getUser.method).toBe("get");
      expect(getUser.path).toBe(":id");
    });

    it("captures a bare path when the closure passes no variables", () => {
      const listUsers = base.endpoint.response(UserSchema).get("");

      expect(listUsers.method).toBe("get");
      expect(listUsers.path).toBe("");
    });

    it("records the verb the vendor requires, not the declared semantics", () => {
      const search = base.endpoint
        .variables(z.object({ q: z.string() }))
        .response(UserSchema)
        .post("search").reads();

      expect(search.method).toBe("post");
      expect(search.kind).toBe("query");
    });

    it("maps a channel connect onto a get for the wire shape", () => {
      const presence = base.channel
        .variables(z.object({ room: z.string() }))
        .response(UserSchema)
        .connect(":room/presence");

      expect(presence.path).toBe(":room/presence");
      expect(presence.kind).toBe("channel");
    });

    it("rejects a closure that addresses nothing", () => {
      expect(() => base.endpoint.response(UserSchema).via((() => ({})) as never)).toThrow(
        /made no wire call/,
      );
    });
  });

  describe("slots", () => {
    it("records the schemas it was given", () => {
      const createUser = base.endpoint.variables(ById).response(UserSchema).post("");

      expect(meta(createUser).response).toBe(UserSchema);
      expect(meta(createUser).variables).toBe(ById);
      expect(meta(createUser).type).toBe("mutation");
    });

    it("produces the same descriptor whichever order the slots are filled", () => {
      const a = base.endpoint.variables(ById).response(UserSchema).get(":id");
      const b = base.endpoint.response(UserSchema).variables(ById).get(":id");

      expect(meta(a)).toEqual(meta(b));
      expect(a.method).toBe(b.method);
      expect(a.path).toBe(b.path);
    });

    it("carries no schema when only a type argument was given", () => {
      const listAudit = base.endpoint
        .variables<{ since: string }>()
        .response<readonly Audit[]>()
        .get("audit");

      expect(meta(listAudit).response).toBeUndefined();
      expect(meta(listAudit).variables).toBeUndefined();
      expect(listAudit.path).toBe("audit");
    });

    it("validates what is sent while leaving what is received untyped at runtime", () => {
      const impersonate = base.endpoint
        .variables(ById)
        .response<{ token: string }>()
        .post(":id/impersonate");

      expect(meta(impersonate).variables).toBe(ById);
      expect(meta(impersonate).response).toBeUndefined();
    });

    it("records a channel send schema", () => {
      const presence = base.channel
        .response(UserSchema)
        .send(CommandSchema).connect("presence");

      // recorded as `receive`, which names the same messages from the server side
      expect(meta(presence).receive).toBe(CommandSchema);
    });

    it("refuses a slot that was already filled", () => {
      expect(() => base.endpoint.response(UserSchema).response(UserSchema)).toThrow(
        /\.response\(\) was called twice/,
      );
    });
  });

  describe("reuse", () => {
    it("lets a partially applied builder serve several endpoints", () => {
      const byId = base.endpoint.variables(ById);

      const profile = byId.response(UserSchema).get(":id/profile");
      const settings = byId.response(UserSchema).get(":id/settings");

      expect(profile.path).toBe(":id/profile");
      expect(settings.path).toBe(":id/settings");
    });

    it("does not leak a setting from one endpoint into its sibling", () => {
      const shared = base.endpoint.variables(ById);

      const slow = shared.timeout(30_000).response(UserSchema).get(":id");
      const plain = shared.response(UserSchema).get(":id");

      expect(options(slow).timeout).toBe(30_000);
      expect(options(plain).timeout).toBeUndefined();
    });
  });

  describe("inheritance", () => {
    const first: Middleware = { name: "first", phase: "before", handler: () => {} };
    const second: Middleware = { name: "second", phase: "before", handler: () => {} };
    const third: Middleware = { name: "third", phase: "before", handler: () => {} };

    it("applies base middleware to every endpoint built from it", () => {
      const vendor = courier({ middleware: [first], timeout: 10_000 });
      const endpoint = vendor.endpoint.response(UserSchema).get("");

      expect(options(endpoint).middleware).toEqual([first]);
      expect(options(endpoint).timeout).toBe(10_000);
    });

    it("appends endpoint middleware after the inherited list", () => {
      const vendor = courier({ middleware: [first] });
      const endpoint = vendor.endpoint.use(second).response(UserSchema).get("");

      expect(options(endpoint).middleware).toEqual([first, second]);
    });

    it("concatenates parent middleware first when extending", () => {
      const vendor = courier({ middleware: [first] });
      const admin = vendor.extend({ middleware: [second] });
      const endpoint = admin.endpoint.use(third).response(UserSchema).get("");

      expect(options(endpoint).middleware).toEqual([first, second, third]);
    });

    it("replaces scalars rather than merging them when extending", () => {
      const vendor = courier({ timeout: 10_000 });
      const slow = vendor.extend({ timeout: 60_000 });
      const endpoint = slow.endpoint.response(UserSchema).get("");

      expect(options(endpoint).timeout).toBe(60_000);
    });

    it("drops the inherited middleware when the endpoint opts out", () => {
      const vendor = courier({ middleware: [first] });
      const endpoint = vendor.endpoint
        .response(UserSchema)
        .get("", { inherit: false });

      expect(options(endpoint).middleware).toEqual([]);
    });

    it("leaves the parent base untouched when it is extended", () => {
      const vendor = courier({ middleware: [first] });
      vendor.extend({ middleware: [second] });
      const endpoint = vendor.endpoint.response(UserSchema).get("");

      expect(options(endpoint).middleware).toEqual([first]);
    });
  });

  describe("terminal options", () => {
    it("keeps kind specific options on the descriptor", () => {
      const feed = base.stream
        .variables(ById)
        .response(UserSchema).get(":id/events", {
          reconnect: { maxAttempts: 5, backoff: "exponential" },
          tags: ["activity"],
        });

      expect(options(feed).reconnect).toEqual({ maxAttempts: 5, backoff: "exponential" });
      expect(options(feed).tags).toEqual(["activity"]);
    });

    it("carries a cache config declared on a query", () => {
      const listUsers = base.endpoint
        .response(UserSchema)
        .get("").cache({ revalidate: 60 });

      expect(options(listUsers).cache).toEqual({ revalidate: 60 });
    });
  });
});

describe("type level guarantees", () => {
  const base = courier();

  it("describes the same endpoint whichever side of the verb a slot is named", () => {
    const before = base.endpoint.variables(ById).response(UserSchema).get(":id");
    const after = base.endpoint.get(":id").variables(ById).response(UserSchema);

    expect(after.method).toBe(before.method);
    expect(after.path).toBe(before.path);
    expect(after.kind).toBe(before.kind);
    expect(meta(after)).toEqual(meta(before));
  });

  it("stays readable as a descriptor once addressed", () => {
    const endpoint = base.endpoint.get("").response(UserSchema);

    expect(endpoint.kind).toBe("query");
    expect(Object.keys(endpoint)).toEqual(["kind", "method", "path", "probe", "served", "options"]);
  });

  it("keeps a cached answer only for an endpoint that reads", () => {
    const cached = base.endpoint.response(UserSchema).get("").cache({ revalidate: 60 });
    expect(cached.kind).toBe("query");

    const overPost = base.endpoint
      .response(UserSchema)
      .post("search")
      .reads()
      .cache({ revalidate: 60 });
    expect(overPost.kind).toBe("query");

    function rejected(): void {
      // @ts-expect-error an endpoint that writes has no answer worth keeping
      base.endpoint.response(UserSchema).post("").cache({ revalidate: 60 });
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
    const getUser = base.endpoint.variables(ById).response(UserSchema).get(":id");
    const sample: InferResponse<typeof getUser> = { id: "1", email: "a@b.c" };
    expect(sample.email).toBe("a@b.c");
  });

  it("infers a declared type when no schema was given", () => {
    const listAudit = base.endpoint.response<readonly Audit[]>().get("audit");

    const sample: InferResponse<typeof listAudit> = [{ id: "1" }];
    expect(sample[0]?.id).toBe("1");
  });
});

describe("wire surfaces", () => {
  const api = courier();

  it("types a closure lifted out of the chain", () => {
    interface Vars {
      readonly id: string;
    }

    const byId: HttpProbe<Vars> = (http, vars) => http.get(":id", vars);
    const getUser = api.endpoint.variables<Vars>().response(UserSchema).via(byId);

    expect(getUser.method).toBe("get");
    expect(getUser.path).toBe(":id");
  });

  it("types a stream closure lifted out of the chain", () => {
    const feed: StreamProbe<void> = (sse) => sse.get("feed");
    const events = api.stream.response(UserSchema).via(feed);

    expect(events.path).toBe("feed");
  });

  it("types a channel closure lifted out of the chain", () => {
    const room: ChannelProbe<void> = (ws) => ws.connect("room");
    const chat = api.channel.response(UserSchema).via(room);

    expect(chat.path).toBe("room");
  });
});
