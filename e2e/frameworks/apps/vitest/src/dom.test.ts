// @vitest-environment jsdom
import { expect, it } from "vitest";

import config from "../courier.config";
import { opened } from "./opened";

/* A test may import the config itself, under jsdom too, where a page may not. */
it("sees them under jsdom, beside the config", () => {
  expect(typeof document).toBe("object");
  expect(Object.keys(config.sources)).toEqual(["catalog"]);
  expect(opened()).toBe("profile");
});
