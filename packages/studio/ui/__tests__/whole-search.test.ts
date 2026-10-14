/**
 * A search over the whole of a body the inspector shows in part: every
 * match counted, the first named, and the tree rows that show them built by
 * walking only into what holds one — the same rows a search over the whole
 * tree keeps; the raw text's lines numbered as in the whole body; and what
 * holds the body between searches, parsed once and let go when told.
 */
import { describe, expect, it } from "vitest";

import { foldedRows } from "@/features/requests/folded-rows";
import { searchJson } from "@/features/requests/json-search";
import { jsonTreeRows } from "@/features/requests/json-tree";
import { searchWholeLines, searchWholeTree, WHOLE_LIMITS } from "@/features/requests/whole-search";
import { createWholeHolder } from "@/features/requests/whole-search-holder";

const NAMES = ["Kazan", "Samara", "Perm", "Kaluga", "Omsk"];
/* Five thousand cities: what a body cut to its first items leaves out holds most of them. */
const CITIES = {
  data: {
    cities: Array.from({ length: 5_000 }, (_, at) => ({
      id: at,
      name: `${NAMES[at % NAMES.length]}-${at}`,
    })),
  },
  meta: { source: "kazan-mirror" },
};

describe("searchJson with a limit", () => {
  it("counts every match and names no more than the limit, in the tree's order", () => {
    const found = searchJson(CITIES, "kazan", 10);

    expect(found?.count).toBe(1_001);
    expect(found?.matches).toHaveLength(10);
    expect(found?.matches.slice(0, 2)).toEqual(["data.cities.0.name", "data.cities.5.name"]);
  });

  it("names every match without one", () => {
    expect(searchJson(CITIES, "kazan")?.matches).toHaveLength(1_001);
  });
});

describe("a tree's rows walked only into what a search keeps", () => {
  it("are the rows a whole tree keeps", () => {
    const found = searchJson(CITIES, "omsk-49");
    if (!found) throw new Error("searched nothing");

    const walked = jsonTreeRows(CITIES, new Set(), new Map(), {
      keeps: found.keeps,
      limit: Number.POSITIVE_INFINITY,
    });

    expect(walked).toEqual(
      jsonTreeRows(CITIES, new Set(), new Map()).filter((row) => found.keeps(row.path)),
    );
    const names = CITIES.data.cities.map((city) => city.name);
    expect(walked.filter((row) => row.kind === "value").map((row) => row.text)).toEqual(
      names.filter((name) => name.toLowerCase().includes("omsk-49")).map((name) => `"${name}"`),
    );
  });

  it("stop one row past the limit", () => {
    const found = searchJson(CITIES, "kazan");
    if (!found) throw new Error("searched nothing");

    const walked = jsonTreeRows(CITIES, new Set(), new Map(), { keeps: found.keeps, limit: 7 });

    expect(walked).toHaveLength(8);
  });
});

describe("searchWholeTree", () => {
  it("names the matches its rows show, each with what holds it, and counts them all", () => {
    const result = searchWholeTree(CITIES, "kaz");

    expect(result?.count).toBe(1_001);
    expect(result?.cut).toBe(true);
    expect(result?.matches).toHaveLength(WHOLE_LIMITS.matches);
    expect(result?.rows.length).toBeLessThanOrEqual(WHOLE_LIMITS.rows);
    expect(result?.matches.at(-1)).toBe("data.cities.4995.name");
    const shown = new Set(result?.rows.map((row) => row.path));
    expect(result?.matches.every((path) => shown.has(path))).toBe(true);
    expect(result?.rows.find((row) => row.path === "data.cities.4995.name")?.accessor).toBe(
      "data.cities[4995].name",
    );
  });

  it("is not cut when everything it found shows", () => {
    const result = searchWholeTree(CITIES, "perm-4997");

    expect(result).toMatchObject({ count: 1, matches: ["data.cities.4997.name"], cut: false });
  });

  it("is cut when what it found runs past the rows a view holds", () => {
    /* A container whose key matches shows whole: two thousand users run past the rows. */
    const body = {
      users: Array.from({ length: 2_000 }, (_, at) => ({ id: at, name: `User ${at}` })),
    };

    const result = searchWholeTree(body, "users");

    expect(result).toMatchObject({ count: 1, matches: ["users"], cut: true });
    expect(result?.rows).toHaveLength(WHOLE_LIMITS.rows);
  });

  it("searches nothing for a blank query", () => {
    expect(searchWholeTree(CITIES, "  ")).toBeUndefined();
  });
});

describe("searchWholeLines", () => {
  it("keeps the lines that hold the text, numbered as in the whole text", () => {
    const text = JSON.stringify(CITIES, null, 2).split("\n");

    const line = '        "name": "Omsk-4999"';

    const result = searchWholeLines(text, "omsk-4999");

    expect(result?.lines).toEqual([{ number: text.indexOf(line) + 1, text: line }]);
    expect(result?.lines[0]?.number).toBeGreaterThan(19_990);
    expect(result?.count).toBe(1);
  });

  it("counts every line and keeps the first ones", () => {
    const text = JSON.stringify(CITIES, null, 2).split("\n");

    const result = searchWholeLines(text, "name");

    expect(result?.count).toBe(5_000);
    expect(result?.lines).toHaveLength(WHOLE_LIMITS.lines);
    expect(result?.cut).toBe(true);
  });
});

describe("what holds a whole body between searches", () => {
  it("parses the body sent with the first search and searches it again by its key", () => {
    const holder = createWholeHolder();
    const text = JSON.stringify(CITIES);

    const first = holder.answer({
      id: 1,
      key: "s:r1:response",
      text,
      query: "perm-4997",
      mode: "tree",
    });
    const second = holder.answer({ id: 2, key: "s:r1:response", query: "omsk-4999", mode: "raw" });

    expect(first).toMatchObject({ id: 1, ok: true, result: { count: 1 } });
    const lines = JSON.stringify(CITIES, null, 2).split("\n");
    const number = lines.indexOf('        "name": "Omsk-4999"') + 1;
    expect(second).toMatchObject({ id: 2, ok: true, result: { lines: [{ number }] } });
  });

  it("answers that a body it does not hold is missing, so the page sends its text again", () => {
    const holder = createWholeHolder();
    holder.answer({ id: 1, key: "s:r1:response", text: "[1]", query: "1", mode: "tree" });

    expect(holder.answer({ id: 2, key: "s:r2:response", query: "1", mode: "tree" })).toEqual({
      id: 2,
      ok: false,
      missing: true,
    });
  });

  it("says why a body that does not parse cannot be searched", () => {
    const holder = createWholeHolder();

    const reply = holder.answer({ id: 1, key: "k", text: "{not json", query: "x", mode: "tree" });

    expect(reply).toMatchObject({ id: 1, ok: false, error: expect.stringContaining("JSON") });
  });

  it("lets the body it holds go when told, and answers it missing after", () => {
    const holder = createWholeHolder();
    holder.answer({ id: 1, key: "s:r1:response", text: "[1]", query: "1", mode: "tree" });

    holder.forget("s:r2:response");
    const kept = holder.answer({ id: 2, key: "s:r1:response", query: "1", mode: "tree" });
    holder.forget("s:r1:response");
    const gone = holder.answer({ id: 3, key: "s:r1:response", query: "1", mode: "tree" });

    expect(kept).toMatchObject({ id: 2, ok: true, result: { count: 1 } });
    expect(gone).toEqual({ id: 3, ok: false, missing: true });
  });
});

describe("foldedRows", () => {
  it("draws a closed container closed and leaves its rows out, unless it holds a match", () => {
    const result = searchWholeTree({ a: { x: "kaz" }, b: { y: "kaz" } }, "kaz");
    if (!result) throw new Error("searched nothing");

    const rows = foldedRows(result.rows, ["a.x"], new Set(["a", "b"]));

    expect(rows.map((row) => `${row.kind}:${row.path}:${row.text}`)).toEqual([
      "open::{",
      "open:a:{",
      'value:a.x:"kaz"',
      "close:a:}",
      "open:b:{…}",
      "close::}",
    ]);
  });
});
