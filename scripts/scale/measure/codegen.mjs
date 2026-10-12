/**
 * Importing the enterprise project's OpenAPI document into Courier: how
 * long Studio's importer takes to read it and to write the API's code, and
 * how long TypeScript takes over the code it wrote — the step a project
 * runs on every build.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { enterpriseModel } from "../fixture/model.mjs";
import { enterpriseOpenApi } from "../fixture/openapi.mjs";
import { measured } from "./metrics.mjs";

/**
 * Import the project's OpenAPI document and type-check what the import wrote.
 *
 * @param {{ dir: string, repo: string, endpoints: number }} fixture - The project and the repository
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @example
 * ```js
 * await measureCodegen({ dir, repo, endpoints: 1000 });
 * ```
 */
export async function measureCodegen({ dir, repo, endpoints }) {
  const work = join(dir, ".scale", "codegen");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const spec = enterpriseOpenApi(enterpriseModel({ endpoints }));
  const specFile = join(work, "enterprise.openapi.json");
  writeFileSync(specFile, JSON.stringify(spec));
  const operations = Object.values(spec.paths).reduce(
    (sum, path) => sum + Object.keys(path).length,
    0,
  );
  const runner = await bundleImporter(repo, work);
  const imported = JSON.parse(
    execFileSync(process.execPath, [runner, specFile, join(work, "out")], { encoding: "utf8" })
      .trim()
      .split("\n")
      .at(-1) ?? "{}",
  );
  const checked = typeCheck(repo, work);
  return [
    measured("codegen.parse", imported.parseMs, "ms", 2_000, {
      note: `${operations} operations, ${Math.round(JSON.stringify(spec).length / 1024)} KB of OpenAPI`,
    }),
    measured("codegen.generate", imported.generateMs, "ms", 5_000, {
      note: `${imported.files} files, ${Math.round(imported.bytes / 1024)} KB of code`,
    }),
    measured("codegen.tsc", checked.seconds * 1000, "ms", 30_000, {
      note: `${checked.errors} errors, ${checked.memoryMb} MB`,
    }),
    measured("codegen.tscErrors", checked.errors, "errors", 0),
  ];
}

/* Studio's importer, bundled from the repository's sources: it is not part of Studio's published API. */
async function bundleImporter(repo, work) {
  const entry = join(work, "import-entry.mjs");
  writeFileSync(
    entry,
    `import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseSpec } from ${JSON.stringify(join(repo, "packages/studio/src/apis/parser"))};
import { generateCode } from ${JSON.stringify(join(repo, "packages/studio/src/apis/generator"))};
const [specFile, out] = process.argv.slice(2);
const raw = readFileSync(specFile, "utf8");
let begun = performance.now();
const spec = parseSpec(raw);
const parseMs = performance.now() - begun;
begun = performance.now();
const files = generateCode(spec, { type: "openapi", sourceName: "enterprise", outputDir: "src/api" });
const generateMs = performance.now() - begun;
let bytes = 0;
for (const file of files) {
  const path = join(out, file.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, file.content);
  bytes += file.content.length;
}
console.log(JSON.stringify({ parseMs, generateMs, files: files.length, bytes }));
`,
  );
  const { build } = await import("esbuild");
  const outfile = join(work, "import.mjs");
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    logLevel: "error",
  });
  return outfile;
}

/* TypeScript over what the import wrote, as strict as the project's own code. */
function typeCheck(repo, work) {
  const tsconfig = join(work, "tsconfig.json");
  writeFileSync(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2022",
        skipLibCheck: true,
        types: [],
      },
      include: ["out/**/*.ts"],
    }),
  );
  let output = "";
  try {
    output = execFileSync(
      process.execPath,
      [join(repo, "node_modules/typescript/bin/tsc"), "-p", tsconfig, "--extendedDiagnostics"],
      { cwd: work, encoding: "utf8", maxBuffer: 64 * 2 ** 20 },
    );
  } catch (error) {
    /* Errors in the generated code are figures of their own. */
    output = String(error.stdout ?? "");
  }
  const seconds = Number(/Total time:\s+([\d.]+)s/.exec(output)?.[1] ?? Number.NaN);
  const memoryMb = Math.round(Number(/Memory used:\s+(\d+)K/.exec(output)?.[1] ?? 0) / 1024);
  const errors = (output.match(/error TS\d+/g) ?? []).length;
  return { seconds, memoryMb, errors };
}
