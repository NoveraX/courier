import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockServer } from "../src/server/create-mock-server";
import { createRecorder } from "../src/record/recorder";
import { replayFixtures } from "../src/record/replay";
import { diffFixtures } from "../src/record/diff";
import { fixturesToHar, harToFixtures } from "../src/record/fixture";
import { createMockClient } from "../src/create-mock-client";
import { defineFactory } from "../src/factory";

type User = { id: string; name: string };

const userFactory = defineFactory<User>({
  defaults: () => ({ id: String(Math.random()).slice(2, 8), name: "Alice" }),
});

describe("Record & Replay", () => {
  // Start a real mock server to record from
  const server = createMockServer({ port: 0, log: false });
  let targetUrl: string;

  beforeAll(async () => {
    server.mock("users", "getAll").resolves(userFactory.buildList(2));
    server.mock("users", "getById").returns((ctx) => {
      const vars = ctx.variables as { id: string } | undefined;
      return userFactory.build({ id: vars?.id ?? "0" });
    });
    const info = await server.start();
    targetUrl = info.url;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe("createRecorder", () => {
    it("records real API responses as fixtures", async () => {
      const recorder = createRecorder({ targetUrl });

      await (recorder.client as any).users.getAll();
      await (recorder.client as any).users.getById({ id: "42" });

      const fixtures = recorder.getFixtures();
      expect(fixtures).toHaveLength(2);
      expect(fixtures[0]?.group).toBe("users");
      expect(fixtures[0]?.method).toBe("getAll");
      expect(fixtures[0]?.response.status).toBe(200);
      expect(fixtures[0]?.response.data).toHaveLength(2);
      expect(fixtures[1]?.group).toBe("users");
      expect(fixtures[1]?.method).toBe("getById");
    });

    it("generates valid HAR format", async () => {
      const recorder = createRecorder({ targetUrl });
      await (recorder.client as any).users.getAll();

      const har = recorder.toHar();
      expect(har.log.version).toBe("1.2");
      expect(har.log.entries).toHaveLength(1);
      expect(har.log.entries[0]?._nexus.group).toBe("users");
      expect(har.log.entries[0]?.response.status).toBe(200);
    });

    it("sanitizes fixture data", async () => {
      const recorder = createRecorder({
        targetUrl,
        sanitize: (data) => {
          if (Array.isArray(data)) {
            return data.map((item: any) => ({ ...item, name: "[REDACTED]" }));
          }
          return data;
        },
      });

      await (recorder.client as any).users.getAll();
      const fixtures = recorder.getFixtures();
      const users = fixtures[0]?.response.data as User[];
      expect(users[0]?.name).toBe("[REDACTED]");
    });

    it("filters endpoints", async () => {
      const recorder = createRecorder({
        targetUrl,
        filter: (group) => group === "users",
      });

      await (recorder.client as any).users.getAll();
      expect(recorder.getFixtures()).toHaveLength(1);

      await expect(
        (recorder.client as any).posts.getAll(),
      ).rejects.toThrow("excluded by filter");
    });

    it("clears recorded fixtures", async () => {
      const recorder = createRecorder({ targetUrl });
      await (recorder.client as any).users.getAll();
      expect(recorder.getFixtures()).toHaveLength(1);

      recorder.clear();
      expect(recorder.getFixtures()).toHaveLength(0);
    });
  });

  describe("replayFixtures", () => {
    it("replays recorded fixtures as mock scenario", async () => {
      // Record
      const recorder = createRecorder({ targetUrl });
      await (recorder.client as any).users.getAll();
      await (recorder.client as any).users.getById({ id: "7" });
      const fixtures = recorder.getFixtures();

      // Replay
      const scenario = replayFixtures(fixtures);
      const { client } = createMockClient({ scenario });

      const users = await (client as any).users.getAll();
      expect(users).toHaveLength(2);

      const user = await (client as any).users.getById();
      expect(user.id).toBe("7");
    });

    it("replays multiple fixtures as sequence", async () => {
      // Record same endpoint twice with different results
      const recorder = createRecorder({ targetUrl });
      await (recorder.client as any).users.getById({ id: "1" });
      await (recorder.client as any).users.getById({ id: "2" });

      const fixtures = recorder.getFixtures();
      const scenario = replayFixtures(fixtures);
      const { client } = createMockClient({ scenario });

      const first = await (client as any).users.getById();
      const second = await (client as any).users.getById();
      expect(first.id).toBe("1");
      expect(second.id).toBe("2");
    });
  });

  describe("HAR conversion", () => {
    it("converts fixtures → HAR → fixtures roundtrip", async () => {
      const recorder = createRecorder({ targetUrl });
      await (recorder.client as any).users.getAll();
      const original = recorder.getFixtures();

      const har = fixturesToHar(original);
      const restored = harToFixtures(har);

      expect(restored).toHaveLength(original.length);
      expect(restored[0]?.group).toBe(original[0]?.group);
      expect(restored[0]?.method).toBe(original[0]?.method);
      expect(restored[0]?.response.status).toBe(original[0]?.response.status);
    });
  });

  describe("diffFixtures", () => {
    it("detects added endpoints", () => {
      const baseline = [
        { group: "users", method: "getAll", response: { status: 200, data: [], headers: {} }, duration: 10, recordedAt: "" },
      ];
      const current = [
        ...baseline,
        { group: "posts", method: "getAll", response: { status: 200, data: [], headers: {} }, duration: 10, recordedAt: "" },
      ];

      const diffs = diffFixtures(baseline, current);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.type).toBe("added");
      expect(diffs[0]?.group).toBe("posts");
    });

    it("detects removed endpoints", () => {
      const baseline = [
        { group: "users", method: "getAll", response: { status: 200, data: [], headers: {} }, duration: 10, recordedAt: "" },
        { group: "posts", method: "getAll", response: { status: 200, data: [], headers: {} }, duration: 10, recordedAt: "" },
      ];
      const current = [baseline[0]!];

      const diffs = diffFixtures(baseline, current);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.type).toBe("removed");
      expect(diffs[0]?.group).toBe("posts");
    });

    it("detects changed response data", () => {
      const baseline = [
        { group: "users", method: "getAll", response: { status: 200, data: [{ id: "1", name: "Alice" }], headers: {} }, duration: 10, recordedAt: "" },
      ];
      const current = [
        { group: "users", method: "getAll", response: { status: 200, data: [{ id: "1", name: "Bob", email: "bob@test.com" }], headers: {} }, duration: 10, recordedAt: "" },
      ];

      const diffs = diffFixtures(baseline, current);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.type).toBe("changed");
      expect(diffs[0]?.changes?.length).toBeGreaterThan(0);

      const nameChange = diffs[0]?.changes?.find((c) => c.path.includes("name"));
      expect(nameChange?.before).toBe("Alice");
      expect(nameChange?.after).toBe("Bob");
    });

    it("returns empty for identical fixtures", () => {
      const fixtures = [
        { group: "users", method: "getAll", response: { status: 200, data: [1, 2, 3], headers: {} }, duration: 10, recordedAt: "" },
      ];

      const diffs = diffFixtures(fixtures, fixtures);
      expect(diffs).toHaveLength(0);
    });
  });
});
