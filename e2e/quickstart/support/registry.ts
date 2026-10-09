import { execFileSync } from "node:child_process";
import { createReadStream, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import { packageDirs, publishOrder } from "../../../scripts/release-order";
import { REPO } from "../../support/project";

/** One of Courier's packages, packed as the registry ships it. */
interface Packed {
  readonly manifest: Record<string, unknown>;
  readonly file: string;
  readonly integrity: string;
  readonly shasum: string;
}

interface PackResult {
  filename: string;
  integrity: string;
  shasum: string;
}

function isPackResult(value: unknown): value is PackResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "filename" in value &&
    "integrity" in value &&
    "shasum" in value
  );
}

/* Pack a built package without running its scripts: the build is the one CI made. */
function pack(dir: string, into: string): Packed {
  const out = execFileSync(
    "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", into],
    { cwd: join(REPO, dir), encoding: "utf8" },
  );
  const [result]: unknown[] = JSON.parse(out);
  if (!isPackResult(result)) throw new Error(`npm pack in ${dir} gave no tarball`);
  const manifest: Record<string, unknown> = JSON.parse(
    readFileSync(join(REPO, dir, "package.json"), "utf8"),
  );
  return {
    manifest,
    file: join(into, result.filename),
    integrity: result.integrity,
    shasum: result.shasum,
  };
}

/** A registry that serves Courier's packages and nothing else, and how to stop it. */
export interface Registry {
  readonly url: string;
  close(): Promise<void>;
}

/**
 * Serve Courier's packages, built and packed, as an npm registry would:
 * a package document for each and its tarball. Package managers reach it
 * for the `@noverax` scope alone, and npm's own registry for the rest, so
 * a project is set up exactly as it would be once the packages are
 * published.
 *
 * @param into - Where the tarballs go
 * @returns The registry's address, and how to stop it
 * @example
 * ```ts
 * const registry = await serveRegistry(join(tmpdir(), "tarballs"));
 * process.env["npm_config_@noverax:registry"] = registry.url;
 * ```
 */
export async function serveRegistry(into: string): Promise<Registry> {
  mkdirSync(into, { recursive: true });
  const packed = new Map<string, Packed>();
  for (const dir of publishOrder(packageDirs())) {
    const entry = pack(dir, into);
    packed.set(String(entry.manifest.name), entry);
  }
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://registry").pathname);
    const tarball = path.match(/^\/tarballs\/(.+)$/)?.[1];
    const byFile = tarball
      ? [...packed.values()].find((entry) => entry.file.endsWith(`/${tarball}`))
      : undefined;
    if (byFile) {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      createReadStream(byFile.file).pipe(response);
      return;
    }
    const entry = packed.get(path.slice(1));
    if (entry === undefined) {
      response.writeHead(404, { "content-type": "application/json" }).end('{"error":"not found"}');
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(document(entry, `http://${request.headers.host}`)));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

/* A package's document, as npm's registry writes one, with its one version. */
function document(entry: Packed, base: string): Record<string, unknown> {
  const version = String(entry.manifest.version);
  const name = String(entry.manifest.name);
  const file = entry.file.split("/").at(-1) ?? "";
  return {
    name,
    "dist-tags": { latest: version },
    versions: {
      [version]: {
        ...entry.manifest,
        dist: {
          tarball: `${base}/tarballs/${file}`,
          integrity: entry.integrity,
          shasum: entry.shasum,
        },
      },
    },
  };
}
