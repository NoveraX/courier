import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fixturesToHar } from "../../src/record/fixture";
import { createRecorder } from "../../src/record/recorder";

const { endpoint } = courier();
const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    users: defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response<string[]>() } }),
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
