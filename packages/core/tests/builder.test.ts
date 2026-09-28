import { describe, expect, it } from "vitest";
import { z } from "zod";
import { courier } from "../src/define/courier";
import type { InferResponse } from "../src/define/marker";
import { ENDPOINT_SCHEMA } from "../src/validation";
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
      const getUser = base.endpoint.get(":id").variables(ById).response(UserSchema);

      expect(getUser.method).toBe("get");
      expect(getUser.path).toBe(":id");
    });

    it("captures a bare path when the closure passes no variables", () => {
      const listUsers = base.endpoint.get("").response(UserSchema);

      expect(listUsers.method).toBe("get");
      expect(listUsers.path).toBe("");
    });

    it("records the verb the vendor requires, not the declared semantics", () => {
      const search = base.endpoint.post("search").variables(z.object({ q: z.string() })).response(UserSchema).reads();

      expect(search.method).toBe("post");
      expect(search.kind).toBe("query");
    });

    it("maps a channel connect onto a get for the wire shape", () => {
      const presence = base.channel.connect(":room/presence").variables(z.object({ room: z.string() })).response(UserSchema);

      expect(presence.path).toBe(":room/presence");
      expect(presence.kind).toBe("channel");
    });

    it("rejects a closure that addresses nothing", () => {
      expect(() => base.endpoint.via((() => ({})) as never)).toThrow(
        /made no wire call/,
      );
    });
  });

  describe("slots", () => {
    it("records the schemas it was given", () => {
      const createUser = base.endpoint.post("").variables(ById).response(UserSchema);

      expect(meta(createUser).response).toBe(UserSchema);
      expect(meta(createUser).variables).toBe(ById);
      expect(meta(createUser).type).toBe("mutation");
    });

    it("produces the same descriptor whichever order the slots are filled", () => {
      const a = base.endpoint.get(":id").variables(ById).response(UserSchema);
      const b = base.endpoint.get(":id").response(UserSchema).variables(ById);

      expect(meta(a)).toEqual(meta(b));
      expect(a.method).toBe(b.method);
      expect(a.path).toBe(b.path);
    });

    it("carries no schema when only a type argument was given", () => {
      const listAudit = base.endpoint.get("audit").variables<{ since: string }>().response<readonly Audit[]>();

      expect(meta(listAudit).response).toBeUndefined();
      expect(meta(listAudit).variables).toBeUndefined();
      expect(listAudit.path).toBe("audit");
    });

    it("validates what is sent while leaving what is received untyped at runtime", () => {
      const impersonate = base.endpoint.post(":id/impersonate").variables(ById).response<{ token: string }>();

      expect(meta(impersonate).variables).toBe(ById);
      expect(meta(impersonate).response).toBeUndefined();
    });

    it("records a channel send schema", () => {
      const presence = base.channel.connect("presence").response(UserSchema).send(CommandSchema);

      // recorded as `receive`, which names the same messages from the server side
      expect(meta(presence).receive).toBe(CommandSchema);
    });

    it("refuses a slot that was already filled", () => {
      expect(() => base.endpoint.get("").response(UserSchema).response(UserSchema)).toThrow(
        /\.response\(\) was called twice/,
      );
    });

    it("names the endpoint and the remedy when a slot is filled twice", () => {
      const refusal = () => base.endpoint.del("files/:id").response(UserSchema).response(UserSchema);

      expect(refusal).toThrow(
        '[courier] .response() was called twice on DELETE "files/:id". Each slot takes one schema or type, and the second would replace the first: remove one of the two calls.',
      );
    });

    it("says the same endpoint when the slot is filled twice before a verb", () => {
      expect(() => base.endpoint.variables(ById).variables(ById)).toThrow(
        /\.variables\(\) was called twice on the same endpoint\. .*remove one of the two calls/,
      );
    });
  });

  describe("reuse", () => {
    it("lets a partially applied builder serve several endpoints", () => {
      const byId = base.endpoint.variables(ById);

      const profile = byId.get(":id/profile").response(UserSchema);
      const settings = byId.get(":id/settings").response(UserSchema);

      expect(profile.path).toBe(":id/profile");
      expect(settings.path).toBe(":id/settings");
    });

    it("does not leak a setting from one endpoint into its sibling", () => {
      const shared = base.endpoint.variables(ById);

      const slow = shared.timeout(30_000).get(":id").response(UserSchema);
      const plain = shared.get(":id").response(UserSchema);

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
      const endpoint = vendor.endpoint.get("").response(UserSchema);

      expect(options(endpoint).middleware).toEqual([first]);
      expect(options(endpoint).timeout).toBe(10_000);
    });

    it("appends endpoint middleware after the inherited list", () => {
      const vendor = courier({ middleware: [first] });
      const endpoint = vendor.endpoint.get("").use(second).response(UserSchema);

      expect(options(endpoint).middleware).toEqual([first, second]);
    });

    it("concatenates parent middleware first when extending", () => {
      const vendor = courier({ middleware: [first] });
      const admin = vendor.extend({ middleware: [second] });
      const endpoint = admin.endpoint.get("").use(third).response(UserSchema);

      expect(options(endpoint).middleware).toEqual([first, second, third]);
    });

    it("replaces scalars rather than merging them when extending", () => {
      const vendor = courier({ timeout: 10_000 });
      const slow = vendor.extend({ timeout: 60_000 });
      const endpoint = slow.endpoint.get("").response(UserSchema);

      expect(options(endpoint).timeout).toBe(60_000);
    });

    it("drops the inherited middleware when the endpoint opts out", () => {
      const vendor = courier({ middleware: [first] });
      const endpoint = vendor.endpoint.get("", { inherit: false }).response(UserSchema);

      expect(options(endpoint).middleware).toEqual([]);
    });

    it("keeps the endpoint's own middleware when it opts out", () => {
      const vendor = courier({ middleware: [first] });
      const admin = vendor.extend({ middleware: [second] });
      const before = admin.endpoint.use(third).get("", { inherit: false });
      const after = admin.endpoint.get("", { inherit: false }).use(third);

      expect(options(before).middleware).toEqual([third]);
      expect(options(after).middleware).toEqual([third]);
    });

    it("keeps the endpoint's own middleware when it opts out of a closure's base", () => {
      const vendor = courier({ middleware: [first] });
      const endpoint = vendor.endpoint
        .use(second)
        .via((http) => http.post("login"), { inherit: false })
        .use(third);

      expect(options(endpoint).middleware).toEqual([second, third]);
    });

    it("leaves the parent base untouched when it is extended", () => {
      const vendor = courier({ middleware: [first] });
      vendor.extend({ middleware: [second] });
      const endpoint = vendor.endpoint.get("").response(UserSchema);

      expect(options(endpoint).middleware).toEqual([first]);
    });
  });

  describe("terminal options", () => {
    it("keeps the options a stream is addressed with on the descriptor", () => {
      const feed = base.stream
        .get(":id/events", { tags: ["activity"], deprecated: "use feedV2" })
        .variables(ById)
        .response(UserSchema);

      expect(options(feed).tags).toEqual(["activity"]);
      expect(options(feed).deprecated).toBe("use feedV2");
    });

    it("offers no reconnection or heartbeat policy on a stream or a channel", () => {
      const feed = base.stream.get("events", {
        // @ts-expect-error — reconnection is set on the caller, not the endpoint
        reconnect: { maxAttempts: 5 },
      });
      const tail = base.stream.get("tail", {
        // @ts-expect-error — nothing reads a Last-Event-ID header name from here
        lastEventIdHeader: "x-last-id",
      });
      const room = base.channel.connect("room", {
        // @ts-expect-error — the heartbeat belongs to the caller's shared socket
        heartbeat: 5_000,
      });

      expect([feed, tail, room].map((endpoint) => options(endpoint).tags)).toEqual([[], [], []]);
    });

    it("carries a cache config declared on a query", () => {
      const listUsers = base.endpoint.get("").response(UserSchema).cache({ revalidate: 60 });

      expect(options(listUsers).cache).toEqual({ revalidate: 60 });
    });
  });
});

describe("type level guarantees", () => {
  const base = courier();

  it("describes the same endpoint whichever side of the verb a slot is named", () => {
    const before = base.endpoint.get(":id").variables(ById).response(UserSchema);
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
    const cached = base.endpoint.get("").response(UserSchema).cache({ revalidate: 60 });
    expect(cached.kind).toBe("query");

    const overPost = base.endpoint.post("search").response(UserSchema).reads().cache({ revalidate: 60 });
    expect(overPost.kind).toBe("query");

    function rejected(): void {
      // @ts-expect-error an endpoint that writes has no answer worth keeping
      base.endpoint.post("").response(UserSchema).cache({ revalidate: 60 });
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
    const getUser = base.endpoint.get(":id").variables(ById).response(UserSchema);
    const sample: InferResponse<typeof getUser> = { id: "1", email: "a@b.c" };
    expect(sample.email).toBe("a@b.c");
  });

  it("infers a declared type when no schema was given", () => {
    const listAudit = base.endpoint.get("audit").response<readonly Audit[]>();

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
    const getUser = api.endpoint.variables<Vars>().via(byId).response(UserSchema);

    expect(getUser.method).toBe("get");
    expect(getUser.path).toBe(":id");
  });

  it("types a stream closure lifted out of the chain", () => {
    const feed: StreamProbe<void> = (sse) => sse.get("feed");
    const events = api.stream.via(feed).response(UserSchema);

    expect(events.path).toBe("feed");
  });

  it("types a channel closure lifted out of the chain", () => {
    const room: ChannelProbe<void> = (ws) => ws.connect("room");
    const chat = api.channel.via(room).response(UserSchema);

    expect(chat.path).toBe("room");
  });
});
