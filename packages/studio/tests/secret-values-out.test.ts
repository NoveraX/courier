/**
 * A value a call carried leaves Studio by Courier's one rule for a name and
 * its value, wherever it goes: what an agent is shown, a session file, an
 * export as HAR, Postman or JSON, and what a page without the project's
 * token is sent live — in the variables, in the answer and in the address.
 * A strong name hides whatever it is given, a one-time password and a
 * session's id among them; `key`, the one weak name, hides a value that
 * reads as a credential, a number as the digits it is written in; any other
 * name keeps its value — but a string it keeps is read by the core's rules
 * for a text, as `redact()` reads it: a credential in an address or a pair
 * within it is cut, and a place that changed is listed.
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { redact } from "@noverax/courier";
import { REDACTED } from "@noverax/courier/internal";
import type { Namespace } from "socket.io";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { emitLiveEvents, READ_ONLY_PAGES } from "../src/server/live-events";
import { withoutSecrets } from "../src/server/mcp/without-secrets";
import type { StudioServer } from "../src/server/types";

/* Names whose value is a credential, whatever it is. */
const STRONG = ["token", "password", "otp", "sid", "sig", "session", "auth"];
/* The name whose value is a credential only when it reads as one. */
const WEAK = ["key"];
/* Names that say nothing of their value. */
const PLAIN = ["page", "id"];

type Value = string | number;

/* A value of each kind a call gives a name, and whether it reads as a credential. */
const VALUES: readonly (readonly [kind: string, value: Value, readsAsCredential: boolean])[] = [
  ["a word", "made-up", false],
  ["a short code", "1234", false],
  ["a number of two digits", 42, false],
  ["six digits", "123456", true],
  ["a number of six digits", 123456, true],
  ["a random key", "Zq9x7Kp2Lm4Nv8Rt", true],
];

let root: string;
let url: string;
let studio: StudioServer | undefined;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "courier-secret-values-"));
  symlinkSync(
    resolve(import.meta.dirname, "../../../node_modules"),
    join(root, "node_modules"),
    "dir",
  );
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "shop-app" }));
  url = await new Promise<string>((done, fail) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: done,
      onError: fail,
    });
  });
});

afterAll(async () => {
  await studio?.close();
  rmSync(root, { recursive: true, force: true });
});

async function posted(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status, path).toBe(200);
  return response.json();
}

/* A write that carried the name with each kind of value, in its variables, its answer and its address. */
function requestsOf(name: string): Record<string, unknown>[] {
  return VALUES.map(([, value], at) => ({
    id: `r${at}`,
    source: "shop",
    method: "orders",
    httpMethod: "POST",
    startedAt: at,
    variables: { [name]: value, limit: 2 },
    data: { [name]: value, limit: 2 },
    url: `https://shop.example/orders?${name}=${value}&limit=2`,
    statusCode: 200,
  }));
}

type Shown = "hidden" | "shown";

/* Whether a value read back stands as it was given or as the marker; anything else is shown as read. */
function readBack(read: unknown, value: Value): Shown | string {
  if (read === REDACTED) return "hidden";
  if (read === value || read === String(value)) return "shown";
  return `read back as ${JSON.stringify(read)}`;
}

/* The value a name has in an address's query. */
function paramOf(address: unknown, name: string): string | undefined {
  if (typeof address !== "string") return undefined;
  return new RegExp(`[?&]${name}=([^&#]*)`).exec(address)?.[1];
}

type Record_ = Record<string, unknown>;

/* What each place gives back of the requests, for each kind: its variables, its answer, its address. */
type Place = (name: string) => Promise<readonly (readonly [string, unknown])[][]>;

/* The live view a page without the token is sent: the events each request raised, as they arrive. */
function sentToPagesWithoutToken(events: Record_[]): Record_[] {
  const sent: Record_[] = [];
  const pages = {
    adapter: { rooms: new Map([[READ_ONLY_PAGES, new Set(["page-without-token"])]]) },
    to: () => ({ emit: (_name: string, batch: Record_[]) => sent.push(...batch) }),
  };
  emitLiveEvents(pages as unknown as Namespace, events);
  return sent;
}

const PLACES: Readonly<Record<string, Place>> = {
  "what an agent is shown": async (name) =>
    VALUES.map(([, value]) => [
      ["variables", (withoutSecrets({ [name]: value, limit: 2 }) as Record_)[name]],
    ]),
  "a session file": async (name) => {
    const file = (await posted("/api/sessions/file", { requests: requestsOf(name) })) as {
      session: { requests: Record_[] };
    };
    return file.session.requests.map((request) => [
      ["variables", (request.variables as Record_)[name]],
      ["answer", (request.data as Record_)[name]],
      ["address", paramOf(request.url, name)],
    ]);
  },
  "an export as HAR": async (name) => {
    const har = (await posted("/api/sessions/export-live", {
      format: "har",
      requests: requestsOf(name),
    })) as { log: { entries: Record_[] } };
    return har.log.entries.map((entry) => {
      const request = entry.request as { postData: { text: string }; url: string };
      const response = entry.response as { content: { text: string } };
      return [
        ["variables", JSON.parse(request.postData.text)[name]],
        ["answer", JSON.parse(response.content.text)[name]],
        ["address", paramOf(request.url, name)],
      ];
    });
  },
  "an export for Postman": async (name) => {
    const collection = (await posted("/api/sessions/export-live", {
      format: "postman",
      requests: requestsOf(name),
    })) as { item: { request: { body: { raw: string }; url: string }; response: Record_[] }[] };
    return collection.item.map((item) => [
      ["variables", JSON.parse(item.request.body.raw)[name]],
      ["answer", JSON.parse(String(item.response[0]?.body))[name]],
      ["address", paramOf(item.request.url, name)],
    ]);
  },
  "an export as JSON": async (name) => {
    const session = (await posted("/api/sessions/export-live", {
      format: "json",
      requests: requestsOf(name),
    })) as { requests: Record_[] };
    return session.requests.map((request) => [
      ["variables", (request.variables as Record_)[name]],
      ["answer", (request.data as Record_)[name]],
      ["address", paramOf(request.url, name)],
    ]);
  },
  "a page without the token": async (name) =>
    VALUES.map(([, value], at) => {
      const [start, end] = sentToPagesWithoutToken([
        {
          type: "request:start",
          requestId: `r${at}`,
          variables: { [name]: value, limit: 2 },
          url: `https://shop.example/orders?${name}=${value}&limit=2`,
        },
        {
          type: "request:end",
          requestId: `r${at}`,
          status: 200,
          data: { [name]: value, limit: 2 },
        },
      ]);
      return [
        ["variables", (start?.variables as Record_ | undefined)?.[name]],
        ["answer", (end?.data as Record_ | undefined)?.[name]],
        ["address", paramOf(start?.url, name)],
      ];
    }),
};

/* How a name is expected to read a value, in every place alike. */
function expected(name: string, readsAsCredential: boolean): Shown {
  if (STRONG.includes(name)) return "hidden";
  return WEAK.includes(name) && readsAsCredential ? "hidden" : "shown";
}

describe("a value a call carried, as it leaves Studio", () => {
  for (const name of [...STRONG, ...WEAK, ...PLAIN]) {
    it(`is read for ${name} alike in each place, for each kind of value`, async () => {
      const differing: string[] = [];
      for (const [place, read] of Object.entries(PLACES)) {
        const requests = await read(name);
        VALUES.forEach(([kind, value, readsAsCredential], at) => {
          const wanted = expected(name, readsAsCredential);
          for (const [part, found] of requests[at] ?? []) {
            const got = readBack(found, value);
            if (got !== wanted) differing.push(`${kind}, ${part}, ${place}: ${got}, not ${wanted}`);
          }
        });
      }

      expect(differing).toEqual([]);
    });
  }
});

/* Strings under names that say nothing, a credential inside each or none. */
const VARIABLES = {
  callback: "https://app.example/cb?token=made-up-callback-token",
  note: "sent with otp=123456 by mail",
  items: [
    { redirect: "https://app.example/r?sig=made-up-sig&sid=made-up-sid" },
    { comment: "password=made-up-comment" },
  ],
  label: "Order 1042 shipped",
};
const ANSWER = {
  raw: '{"password":"made-up-password","user":"ana"}',
  uploadUrl:
    "https://bucket.s3.amazonaws.com/f.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=made0up0signature0value0123456789",
  message: "Reset it at https://app.example/reset?token=made-up-reset-token within an hour",
  link: "https://shop.example/orders?page=2&sort=name",
};

/* What redact() makes of a value, each string read as a text. */
const expectedOf = (value: unknown) => redact(value);

/* The request that carried them, as each place has it back: its variables and its answer. */
type Carried = { variables: unknown; data: unknown };

const TEXT_PLACES: Readonly<Record<string, () => Promise<Carried>>> = {
  "what an agent is shown": async () => ({
    variables: withoutSecrets(VARIABLES),
    data: withoutSecrets(ANSWER),
  }),
  "a session file": async () => {
    const file = (await posted("/api/sessions/file", { requests: [textRequest()] })) as {
      session: { requests: Record_[] };
    };
    const [request] = file.session.requests;
    return { variables: request?.variables, data: request?.data };
  },
  "an export as HAR": async () => {
    const har = (await posted("/api/sessions/export-live", {
      format: "har",
      requests: [textRequest()],
    })) as { log: { entries: Record_[] } };
    const entry = har.log.entries[0] as {
      request: { postData: { text: string } };
      response: { content: { text: string } };
    };
    return {
      variables: JSON.parse(entry.request.postData.text),
      data: JSON.parse(entry.response.content.text),
    };
  },
  "an export for Postman": async () => {
    const collection = (await posted("/api/sessions/export-live", {
      format: "postman",
      requests: [textRequest()],
    })) as { item: { request: { body: { raw: string } }; response: Record_[] }[] };
    const item = collection.item[0];
    return {
      variables: JSON.parse(item?.request.body.raw ?? "null"),
      data: JSON.parse(String(item?.response[0]?.body)),
    };
  },
  "an export as JSON": async () => {
    const session = (await posted("/api/sessions/export-live", {
      format: "json",
      requests: [textRequest()],
    })) as { requests: Record_[] };
    return { variables: session.requests[0]?.variables, data: session.requests[0]?.data };
  },
  "a page without the token": async () => {
    const [start, end] = sentToPagesWithoutToken([
      { type: "request:start", requestId: "t1", variables: VARIABLES },
      { type: "request:end", requestId: "t1", status: 200, data: ANSWER },
    ]);
    return { variables: start?.variables, data: end?.data };
  },
};

function textRequest(): Record<string, unknown> {
  return {
    id: "t1",
    source: "shop",
    method: "reset",
    httpMethod: "POST",
    startedAt: 1,
    variables: VARIABLES,
    data: ANSWER,
    statusCode: 200,
  };
}

describe("a secret inside a string under a name that says nothing, as it leaves Studio", () => {
  for (const [place, read] of Object.entries(TEXT_PLACES)) {
    it(`is cut in ${place} as redact() cuts it, the rest kept`, async () => {
      const carried = await read();

      expect(carried).toEqual({ variables: expectedOf(VARIABLES), data: expectedOf(ANSWER) });
      expect(carried.variables).toMatchObject({ label: "Order 1042 shipped" });
      expect(carried.data).toMatchObject({ link: "https://shop.example/orders?page=2&sort=name" });
      expect(JSON.stringify(carried)).not.toMatch(/made-up|made0up|otp=123456/);
    });
  }

  it("is listed in a session file by its place", async () => {
    const file = (await posted("/api/sessions/file", { requests: [textRequest()] })) as {
      redactions: string[];
    };

    expect(file.redactions).toEqual([
      "requests[0].variables.callback",
      "requests[0].variables.note",
      "requests[0].variables.items[0].redirect",
      "requests[0].variables.items[1].comment",
      "requests[0].data.raw",
      "requests[0].data.uploadUrl",
      "requests[0].data.message",
    ]);
  });
});
