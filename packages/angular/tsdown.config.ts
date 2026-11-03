import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

/* Angular's own builders, whose option schemas Courier's take: the CLI reads its flags from them. */
const ANGULAR_BUILDERS = join(
  dirname(createRequire(import.meta.url).resolve("@angular/build/package.json")),
  "src/builders",
);

const BUILDERS = ["application", "dev-server", "unit-test"];

/* Each schema as Angular's, but for the options it does not list, which it lets through: an
   earlier Angular takes some this one no longer lists, and checks them itself. */
function writeSchemas(): void {
  mkdirSync("lib/schemas", { recursive: true });
  for (const name of BUILDERS) {
    const schema: unknown = JSON.parse(
      readFileSync(join(ANGULAR_BUILDERS, name, "schema.json"), "utf8"),
    );
    Reflect.set(Object(schema), "additionalProperties", true);
    writeFileSync(join("lib/schemas", `${name}.json`), `${JSON.stringify(schema, null, 2)}\n`);
  }
}

/* Angular's architect loads a builder with require(), so the package is CommonJS. */
export default defineConfig({
  ...sharedBuild,
  entry: Object.fromEntries(
    BUILDERS.map((name) => [`builders/${name}`, `src/builders/${name}.ts`]),
  ),
  format: ["cjs"],
  outExtensions: () => ({ js: ".cjs" }),
  /* Angular reads a builder by its module alone: no project imports one, nor needs its types. */
  dts: false,
  hooks: { "build:done": writeSchemas },
});
