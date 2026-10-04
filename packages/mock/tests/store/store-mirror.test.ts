import { describe, expect, it } from "vitest";

import { storeMirrors } from "../../src/store/store-mirror";

describe("storeMirrors", () => {
  it("mirrors each collection's rows in order, the next row after the highest", () => {
    const mirrors = storeMirrors(
      new Map([
        [
          "users",
          [
            { row: 7, position: 0, data: "{}" },
            { row: 3, position: 1, data: "{}" },
          ],
        ],
        ["posts", []],
      ]),
    );

    expect([...(mirrors.get("users")?.rows.keys() ?? [])]).toEqual([7, 3]);
    expect(mirrors.get("users")?.nextRow).toBe(8);
    expect(mirrors.get("posts")?.nextRow).toBe(1);
  });
});
