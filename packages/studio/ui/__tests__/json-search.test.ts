/**
 * A search over a request's JSON, as a person searching a response means
 * it: every key and every value, whatever their case; the matches in the
 * order the tree shows them; the containers to open to show them; and the
 * rows a tree keeps — what matches, what holds it, and all of a container
 * whose key matches.
 */
import { describe, expect, it } from "vitest";

import { searchJson } from "@/features/requests/json-search";
import { jsonTreeRows } from "@/features/requests/json-tree";

const CITIES = {
  data: {
    cities: [
      { id: 1, name: "Kazan", region: "Tatarstan" },
      { id: 2, name: "Samara", region: "Samara Oblast" },
    ],
    total: 2,
  },
  meta: { source: "kazan-mirror", stale: false },
};

describe("searchJson", () => {
  it("finds a text in keys and values whatever its case, in the tree's order", () => {
    expect(searchJson(CITIES, "KAZAN")?.matches).toEqual(["data.cities.0.name", "meta.source"]);
    expect(searchJson(CITIES, "region")?.matches).toEqual([
      "data.cities.0.region",
      "data.cities.1.region",
    ]);
    expect(searchJson(CITIES, "false")?.matches).toEqual(["meta.stale"]);
    expect(searchJson(CITIES, "2")?.matches).toEqual(["data.cities.1.id", "data.total"]);
  });

  it("seeks nothing for a blank text", () => {
    expect(searchJson(CITIES, "  ")).toBeUndefined();
  });

  it("keeps what matches and what holds it, and opens the way to it", () => {
    const found = searchJson(CITIES, "samara");

    expect(found?.matches).toEqual(["data.cities.1.name", "data.cities.1.region"]);
    expect([...(found?.opened ?? [])].sort()).toEqual(["", "data", "data.cities", "data.cities.1"]);
    const kept = jsonTreeRows(CITIES, new Set(), new Map())
      .filter((row) => found?.keeps(row.path))
      .map((row) => `${row.kind}:${row.path}`);
    expect(kept).toEqual([
      "open:",
      "open:data",
      "open:data.cities",
      "open:data.cities.1",
      "value:data.cities.1.name",
      "value:data.cities.1.region",
      "close:data.cities.1",
      "close:data.cities",
      "close:data",
      "close:",
    ]);
  });

  it("keeps all of a container whose key matches, and opens it", () => {
    const found = searchJson(CITIES, "meta");

    expect(found?.matches).toEqual(["meta"]);
    expect(found?.opened.has("meta")).toBe(true);
    expect(found?.keeps("meta.source")).toBe(true);
    expect(found?.keeps("data.total")).toBe(false);
  });
});

describe("a tree row's path in code", () => {
  it("reaches each value as code would: names after dots, indices and other keys in brackets", () => {
    const rows = jsonTreeRows({ data: { "x-id": [{ name: "Kazan" }] } }, new Set(), new Map());

    expect(rows.filter((row) => row.kind !== "close").map((row) => row.accessor)).toEqual([
      "",
      "data",
      'data["x-id"]',
      'data["x-id"][0]',
      'data["x-id"][0].name',
    ]);
  });
});
