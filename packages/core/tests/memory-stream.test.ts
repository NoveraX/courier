import { describe, expect, it } from "vitest";
import { createMemoryStream } from "../src/realtime/memory-stream";

describe("createMemoryStream", () => {
  it("starts disconnected and connects", async () => {
    const s = createMemoryStream();
    expect(s.isHealthy()).toBe(false);
    await s.connect();
    expect(s.isHealthy()).toBe(true);
  });

  it("appends events and returns sequential IDs", async () => {
    const s = createMemoryStream();
    await s.connect();

    const id1 = await s.append("t", { data: "a", timestamp: 1 });
    const id2 = await s.append("t", { data: "b", timestamp: 2 });
    const id3 = await s.append("t", { data: "c", timestamp: 3 });

    expect(id1).toBe("1");
    expect(id2).toBe("2");
    expect(id3).toBe("3");
  });

  it("retrieves full history after ID 0", async () => {
    const s = createMemoryStream();
    await s.connect();

    await s.append("t", { data: "a", timestamp: 1 });
    await s.append("t", { data: "b", timestamp: 2 });
    await s.append("t", { data: "c", timestamp: 3 });

    const history = await s.getHistory("t", "0");
    expect(history).toHaveLength(3);
    expect(history[0]!.id).toBe("1");
    expect(history[0]!.data).toBe("a");
    expect(history[2]!.id).toBe("3");
  });

  it("resumes from Last-Event-ID correctly", async () => {
    const s = createMemoryStream();
    await s.connect();

    await s.append("t", { data: "a", timestamp: 1 });
    await s.append("t", { data: "b", timestamp: 2 });
    await s.append("t", { data: "c", timestamp: 3 });
    await s.append("t", { data: "d", timestamp: 4 });

    const history = await s.getHistory("t", "2");
    expect(history).toHaveLength(2);
    expect(history[0]!.data).toBe("c");
    expect(history[1]!.data).toBe("d");
  });

  it("respects limit parameter in getHistory", async () => {
    const s = createMemoryStream();
    await s.connect();

    for (let i = 0; i < 10; i++) {
      await s.append("t", { data: `msg-${i}`, timestamp: i });
    }

    const history = await s.getHistory("t", "0", 3);
    expect(history).toHaveLength(3);
    expect(history[0]!.data).toBe("msg-0");
    expect(history[2]!.data).toBe("msg-2");
  });

  it("returns empty array for non-existent topic", async () => {
    const s = createMemoryStream();
    await s.connect();
    expect(await s.getHistory("no-such", "0")).toEqual([]);
  });

  it("returns empty when afterId is beyond last event", async () => {
    const s = createMemoryStream();
    await s.connect();
    await s.append("t", { data: "a", timestamp: 1 });
    expect(await s.getHistory("t", "999")).toEqual([]);
  });

  it("auto-trims on append when exceeding maxSize", async () => {
    const s = createMemoryStream({ maxSize: 5 });
    await s.connect();

    for (let i = 1; i <= 8; i++) {
      await s.append("t", { data: `msg-${i}`, timestamp: i });
    }

    const history = await s.getHistory("t", "0");
    expect(history).toHaveLength(5);
    expect(history[0]!.id).toBe("4");
    expect(history[4]!.id).toBe("8");
  });

  it("manual trim reduces stream length", async () => {
    const s = createMemoryStream();
    await s.connect();
    for (let i = 1; i <= 10; i++) {
      await s.append("t", { data: `msg-${i}`, timestamp: i });
    }

    await s.trim("t", 3);
    const history = await s.getHistory("t", "0");
    expect(history).toHaveLength(3);
    expect(history[0]!.id).toBe("8");
  });

  it("trim on non-existent topic is no-op", async () => {
    const s = createMemoryStream();
    await s.connect();
    await s.trim("no-such", 5);
  });

  it("clears all state on disconnect", async () => {
    const s = createMemoryStream();
    await s.connect();
    await s.append("t", { data: "a", timestamp: 1 });
    await s.disconnect();
    expect(s.isHealthy()).toBe(false);
  });

  it("preserves optional event field", async () => {
    const s = createMemoryStream();
    await s.connect();
    await s.append("t", { event: "user.joined", data: { id: 1 }, timestamp: 1 });
    const history = await s.getHistory("t", "0");
    expect(history[0]!.event).toBe("user.joined");
    expect(history[0]!.data).toEqual({ id: 1 });
  });

  it("topics have independent ID counters", async () => {
    const s = createMemoryStream();
    await s.connect();
    await s.append("a", { data: "x", timestamp: 1 });
    await s.append("b", { data: "y", timestamp: 2 });
    expect((await s.getHistory("a", "0"))[0]!.id).toBe("1");
    expect((await s.getHistory("b", "0"))[0]!.id).toBe("1");
  });

  it("binary search handles resume from middle of large set", async () => {
    const s = createMemoryStream();
    await s.connect();
    for (let i = 1; i <= 20; i++) await s.append("t", { data: i, timestamp: i });
    const history = await s.getHistory("t", "15");
    expect(history).toHaveLength(5);
    expect(history[0]!.id).toBe("16");
    expect(history[4]!.id).toBe("20");
  });
});
