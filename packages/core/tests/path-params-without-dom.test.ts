/**
 * @vitest-environment node
 *
 * A path's parameters are checked against the variables in a project that
 * declares neither the DOM library nor Node's types — TypeScript 6's
 * default of `types: []`, beside a `lib` of ECMAScript alone, as a Fastify
 * project has it. There `FormData`, `Blob` and the other types variables are
 * told from are `any` to Courier's types, and a check that named one after
 * `extends` came out as every parameter missing: each endpoint with
 * variables was refused. Variables that name the parameters are taken, and
 * ones that leave one out are refused, without the DOM library and with it;
 * a body of its own, which fills no parameter by name, is taken beside them.
 */
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCES = resolve(import.meta.dirname, "../src");
/* As TypeScript hands it to its host: with forward slashes, on Windows too. */
const CONSUMER = join(import.meta.dirname, "path-params.fixture.ts").replaceAll("\\", "/");

const CONSUMER_SOURCE = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

const { endpoint } = courier();
const NewUser = z.object({ name: z.string() });

export const api = defineApi({
  baseURL: "https://api.example.com",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: {
        get: endpoint.get(":id").variables(z.object({ id: z.string() })),
        create: endpoint.post("").variables(NewUser),
        typed: endpoint.get(":id").variables<{ id: string }>(),
        either: endpoint.post(":id").variables<{ id: string } | { id: string; note: string }>(),
        // @ts-expect-error the variables name no id for the path
        lost: endpoint.get(":id").variables(z.object({ name: z.string() })),
        // @ts-expect-error the variables name no id for the path
        lostTyped: endpoint.get(":id").variables<{ name: string }>(),
        // @ts-expect-error one of the alternatives names no id
        half: endpoint.post(":id").variables<{ id: string } | { name: string }>(),
      },
    }),
  },
});
`;

/* What the compiler finds wrong with the consumer, its standard library `lib` and no package's types. */
function problemsWith(lib: string[], more = ""): string[] {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2023,
    lib,
    types: [],
    skipLibCheck: true,
    paths: { "@noverax/courier/define": [join(SOURCES, "define/index.ts")] },
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  host.readFile = (file) => (file === CONSUMER ? CONSUMER_SOURCE + more : readFile(file));
  const exists = host.fileExists.bind(host);
  host.fileExists = (file) => file === CONSUMER || exists(file);
  const program = ts.createProgram([CONSUMER], options, host);
  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(CONSUMER))
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}

/* Bodies of their own beside a path's parameter, which they fill no parameter of: bytes, declared everywhere. */
const BYTES = `
export const bytes = defineGroup({
  endpoints: {
    buffer: endpoint.put(":id").variables<ArrayBuffer>(),
    view: endpoint.put(":id").variables<Uint8Array>(),
  },
});
`;

/* And the ones only the DOM library, or Node's types, declare. */
const DOM_BODIES = `
export const domBodies = defineGroup({
  endpoints: {
    blob: endpoint.put(":id").variables<Blob>(),
    stream: endpoint.put(":id").variables<ReadableStream>(),
    search: endpoint.put(":id").variables<URLSearchParams>(),
    form: endpoint.put(":id").variables<FormData>(),
  },
});
`;

describe("a path's parameters, checked against the variables", () => {
  it("are checked where neither the DOM library nor Node's types are declared", () => {
    /* The project has no DOM library: a form is a name it does not know. */
    const noDom =
      "\n// @ts-expect-error no DOM library is declared\nexport type Form = FormData;\n";

    expect(problemsWith(["lib.es2023.d.ts"], noDom + BYTES)).toEqual([]);
  }, 60_000);

  it("are checked with the DOM library, as they were", () => {
    expect(problemsWith(["lib.es2023.d.ts", "lib.dom.d.ts"], BYTES + DOM_BODIES)).toEqual([]);
  }, 60_000);
});
