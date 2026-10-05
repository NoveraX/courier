import { describe, expect, it } from "vitest";
import type { GenerateOptions } from "../src/apis/generator";
import { generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";
import { toSafeIdentifier } from "../src/apis/parser/naming-utils";

const ok = { responses: { "200": { description: "ok" } } };

const SPEC = {
  openapi: "3.0.0",
  info: { title: "Combos", version: "1.0.0" },
  paths: {
    "/2010-04-01/Accounts": {
      get: { operationId: "listAccounts", tags: ["accounts"], ...ok },
      post: { operationId: "createAccount", tags: ["accounts"], ...ok },
    },
    "/2010-04-01/Accounts/{id}": {
      get: { operationId: "getAccount", tags: ["accounts"], ...ok },
    },
  },
  components: {
    schemas: {
      Account: { type: "object", properties: { id: { type: "string" } } },
    },
  },
};

function files(options: Partial<GenerateOptions>): { path: string; content: string }[] {
  return generateCode(parseSpec(JSON.stringify(SPEC)), {
    type: "openapi",
    sourceName: "api",
    outputDir: "src",
    ...options,
  });
}

/** Every relative import must name a file the same run produced. */
function danglingImports(generated: { path: string; content: string }[]): string[] {
  const written = new Set(generated.map((f) => f.path.replace(/\.ts$/, "")));
  const dangling: string[] = [];

  for (const file of generated) {
    const dir = file.path.replace(/\/[^/]+$/, "");
    for (const match of file.content.matchAll(/from "(\.[^"]*)"/g)) {
      const target = match[1] as string;
      const resolved = `${dir}/${target}`
        .split("/")
        .reduce<string[]>((parts, part) => {
          if (part === "..") parts.pop();
          else if (part !== "." && part !== "") parts.push(part);
          return parts;
        }, [])
        .join("/");
      if (!written.has(resolved) && !written.has(`${resolved}/index`)) {
        dangling.push(`${file.path} → ${target}`);
      }
    }
  }
  return dangling;
}

describe("toSafeIdentifier", () => {
  it("moves a leading digit behind an underscore", () => {
    /* `export type 3DModel` does not parse. */
    expect(toSafeIdentifier("3DModel")).toMatch(/^_/);
  });
});

describe("groupBy path", () => {
  it("names a group after a URL segment that is not an identifier", () => {
    const source = files({ groupBy: "path" }).find((f) => f.path.endsWith("source.ts"));

    /* Twilio's first segment is `2010-04-01`. */
    expect(source?.content).not.toMatch(/import \{ \d/);
    expect(source?.content).not.toMatch(/^\s*\d/m);
  });
});

describe("every option combination", () => {
  const validations = ["zod", "valibot", "arktype", "none"] as const;
  const groupings = ["tag", "path", "single"] as const;

  it.each(validations.flatMap((v) => groupings.map((g) => [v, g] as const)))(
    "leaves no import dangling with validation %s and groupBy %s",
    (validation, groupBy) => {
      expect(danglingImports(files({ validation, groupBy }))).toEqual([]);
    },
  );

  it.each([
    { generateSchemas: false },
    { generateTypes: false },
    { generateSchemas: false, generateTypes: false },
    { validation: "none" as const, generateTypes: false },
    { groupBy: "single" as const, validation: "none" as const, generateTypes: false },
    { generateClient: "proxy" as const },
    { generateClient: "both" as const },
    { generateClient: "none" as const },
    { includeComments: false },
    { addAuthMiddleware: false },
  ])("leaves no import dangling for %o", (options) => {
    expect(danglingImports(files(options))).toEqual([]);
  });

  it("writes no empty module", () => {
    for (const file of files({ validation: "none", generateTypes: false })) {
      expect(file.content.trim(), `${file.path} was written empty`).not.toBe("");
    }
  });
});

describe("two schema names that normalise to one identifier", () => {
  it("keeps both definitions instead of dropping the second", () => {
    /* Dropping it lost a definition outright. Note that a reference to the
       second name still resolves to the first — no real specification in the
       sample of 5,955 schemas produces such a pair. */
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "C", version: "1" },
        paths: {},
        components: {
          schemas: {
            "user-id": { type: "object", properties: { a: { type: "string" } } },
            "user.id": { type: "object", properties: { b: { type: "string" } } },
          },
        },
      }),
    );

    expect(Object.keys(spec.schemas)).toEqual(["UserId", "UserId2"]);
  });
});
