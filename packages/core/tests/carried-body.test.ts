import { describe, expect, it } from "vitest";

import { CARRIED_BODY_BYTES, carriedBody } from "../src/studio/carried-body";

const orders = (count: number) =>
  Array.from({ length: count }, (_, id) => ({ id, userId: `user-${id % 7}`, total: id * 3 }));

const sizeOf = (value: unknown) => JSON.stringify(value).length;

describe("carriedBody", () => {
  it("carries a body that fits whole, and nothing more", () => {
    const body = { id: 1, name: "Ada" };

    expect(carriedBody(body)).toEqual({ value: body });
  });

  it("carries the first records of a long list and counts the rest", () => {
    const body = orders(46_000);

    const { value, whole } = carriedBody(body);

    expect(Array.isArray(value)).toBe(true);
    const items = value as unknown[];
    expect(items.slice(0, 3)).toEqual(body.slice(0, 3));
    expect(items.at(-1)).toBe(
      `… ${(46_000 - items.length + 1).toLocaleString("en-US")} more items`,
    );
    expect(sizeOf(value)).toBeLessThanOrEqual(CARRIED_BODY_BYTES + 64);
    expect(whole?.text).toBe(JSON.stringify(body));
    expect(whole?.bytes).toBe(Buffer.byteLength(JSON.stringify(body)));
  });

  it("keeps a page's small fields and cuts its list to the room left", () => {
    const body = { items: orders(20_000), total: 20_000, page: 1 };

    const { value } = carriedBody(body);

    expect(value).toMatchObject({ total: 20_000, page: 1 });
    expect(Object.keys(value as object)).toEqual(["items", "total", "page"]);
    const items = (value as { items: unknown[] }).items;
    expect(items.at(-1)).toMatch(/^… [\d,]+ more items$/);
    expect(sizeOf(value)).toBeLessThanOrEqual(CARRIED_BODY_BYTES + 64);
  });

  it("names the fields of a wide object it leaves out", () => {
    const body = Object.fromEntries(
      Array.from({ length: 5000 }, (_, index) => [`key${index}`, index]),
    );

    const { value } = carriedBody(body);

    expect((value as Record<string, unknown>)["…"]).toMatch(/^… [\d,]+ more fields$/);
    expect(sizeOf(value)).toBeLessThanOrEqual(CARRIED_BODY_BYTES + 64);
  });

  it("carries the start of a long text", () => {
    const text = "x".repeat(100_000);

    const { value, whole } = carriedBody(text);

    expect(value).toMatch(/^x+… [\d,]+ more characters$/);
    expect(sizeOf(value)).toBeLessThanOrEqual(CARRIED_BODY_BYTES + 64);
    expect(whole?.bytes).toBe(100_002);
  });

  it("cuts a single record too large for the room, rather than sending none", () => {
    const body = [{ id: 1, notes: "n".repeat(50_000) }, { id: 2 }];

    const { value } = carriedBody(body);

    const [first, rest] = value as [{ id: number; notes: string }, string];
    expect(first.id).toBe(1);
    expect(first.notes).toMatch(/more characters$/);
    expect(rest).toBe("… 1 more item");
  });

  it("counts the bytes of the whole as UTF-8", () => {
    const body = "ж".repeat(10_000) + "😀".repeat(5000);

    expect(carriedBody(body).whole?.bytes).toBe(Buffer.byteLength(JSON.stringify(body)));
  });

  it("carries a note in place of a body with no JSON", () => {
    const body: Record<string, unknown> = { id: 1 };
    body.self = body;

    expect(carriedBody(body).value).toMatch(/^\[a body with no JSON: .*circular/i);
    expect(carriedBody({ size: 10n }).value).toMatch(/^\[a body with no JSON: .*BigInt/i);
  });

  it("carries no body as none", () => {
    expect(carriedBody(undefined)).toEqual({ value: undefined });
  });
});
