import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { findConfigLocals } from "../../../src/server/mocks-edit/plan/find-config-locals";

const ACCEPTED = ["./courier.config", "./courier.config.ts", "./courier.config.js"];

describe("findConfigLocals", () => {
  it("lists every value import of the config's default, in order, with its specifier", () => {
    const text = `import a from "./courier.config";\nimport type b from "./courier.config";\nimport { default as c } from "./courier.config.js";\n`;

    expect(findConfigLocals(parseSource("x.ts", text).program, ACCEPTED)).toEqual([
      { name: "a", specifier: "./courier.config" },
      { name: "c", specifier: "./courier.config.js" },
    ]);
  });
});
