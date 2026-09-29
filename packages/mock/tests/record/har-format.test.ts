import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Fixture } from "../../src/record/fixture";
import { fixturesToHar, harToFixtures } from "../../src/record/fixture";
import { createRecorder } from "../../src/record/recorder";

const { endpoint } = courier();
const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: { getAll: endpoint.get("").response<string[]>() },
    }),
  },
});

let backend: Server;
let url: string;

beforeAll(async () => {
  /* The real API answers after 100 ms, so an entry dated by its answer
     would be 100 ms late. */
  backend = createServer((_req, res) => {
    setTimeout(() => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(["ada"]));
    }, 100);
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => backend.close(() => resolve()));
});

describe("the HAR a recorder exports", () => {
  it("dates each entry by when its request started, as the fixture does", async () => {
    const recorder = createRecorder({ source: api, targetUrl: url });
    const callStartedAt = Date.now();
    await recorder.client.users.getAll();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const [entry] = recorder.toHar().log.entries;
    const [fixture] = recorder.getFixtures();

    expect(entry?.startedDateTime).toBe(fixture?.recordedAt);
    expect(Date.parse(entry?.startedDateTime ?? "") - callStartedAt).toBeLessThan(50);
  });

  it("matches the HAR its fixtures convert to", async () => {
    const recorder = createRecorder({ source: api, targetUrl: url });
    await recorder.client.users.getAll();

    const exported = recorder.toHar().log.entries.map((entry) => entry.startedDateTime);
    const converted = fixturesToHar(recorder.getFixtures()).log.entries.map(
      (entry) => entry.startedDateTime,
    );

    expect(exported).toEqual(converted);
  });
});

const HAND_WRITTEN: Fixture = {
  group: "users",
  method: "getById",
  variables: { id: 1 },
  response: { status: 200, data: { id: 1 }, headers: {} },
  duration: 2,
  recordedAt: "2026-01-01T00:00:00.000Z",
};

describe("a HAR entry's request", () => {
  it("is the request the fixture was recorded as, with no body the recorder did not see", () => {
    const [entry] = fixturesToHar([
      { ...HAND_WRITTEN, request: { method: "GET", url: "https://api.example/users/1" } },
    ]).log.entries;

    expect(entry?.request).toEqual({
      method: "GET",
      url: "https://api.example/users/1",
      headers: [],
    });
    expect(entry?._courier.variables).toEqual({ id: 1 });
  });

  it("names the call of a fixture that names no request, and reads back as one again", () => {
    const har = fixturesToHar([HAND_WRITTEN]);

    expect(har.log.entries[0]?.request.url).toBe("courier:users/getById");
    expect(harToFixtures(har)).toEqual([HAND_WRITTEN]);
  });
});
