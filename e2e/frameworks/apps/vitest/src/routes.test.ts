import { appendFileSync } from "node:fs";
import { expect, it } from "vitest";

import { opened } from "./opened";

/* Each run writes what it saw, so a rerun's routes are read off the disk. */
it("sees the routes the config opens", () => {
  appendFileSync("seen.log", `${opened()}\n`);
  expect(opened()).toContain("profile");
});
