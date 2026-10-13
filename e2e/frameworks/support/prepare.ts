import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { REPO } from "../../support/project";
import { APPS } from "./apps";
import { run } from "./run";
import { FRAMEWORKS, type Target } from "./targets";

/** Where the applications are built: outside the repository, so npm never takes it for theirs. */
export const BUILDS = join(tmpdir(), "courier-frameworks");

/**
 * Build a target's application as an application gets Courier: the
 * template and its overlays copied, Courier's packages packed and
 * installed from the tarballs with the framework from npm, the API's
 * address written in, and the application built.
 *
 * @param target - The framework version
 * @param apiUrl - Where the API is
 * @returns The application's folder
 * @example
 * ```ts
 * const root = await prepare(targetOf("next-15"), api.url);
 * ```
 */
export async function prepare(target: Target, apiUrl: string): Promise<string> {
  const root = join(BUILDS, target.id);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  for (const template of [target.app, ...(target.overlays ?? [])]) {
    cpSync(join(FRAMEWORKS, "apps", template), root, { recursive: true });
  }
  const settings = APPS[target.app];
  writeFileSync(
    join(root, settings.apiUrlModule),
    `export const API_URL = ${JSON.stringify(apiUrl)};\n`,
  );
  const tarballs = await pack(target.packages, join(BUILDS, `${target.id}-packages`));
  writeManifest(root, target, tarballs);
  /* A request the registry stops answering is given up after a minute and
     asked again, rather than held for npm's five that a stalled install
     spends the job's whole time on. */
  await run(
    ["npm", "install", "--no-audit", "--no-fund", "--fetch-timeout=60000", "--fetch-retries=4"],
    { cwd: root },
  );
  const build = target.build ?? settings.build;
  if (build) await run(build, { cwd: root, env: TELEMETRY_OFF });
  return root;
}

const TELEMETRY_OFF = {
  NEXT_TELEMETRY_DISABLED: "1",
  NUXT_TELEMETRY_DISABLED: "1",
  ASTRO_TELEMETRY_DISABLED: "1",
};

/* Each package packed from its build, as `npm publish` would pack it. */
async function pack(packages: readonly string[], into: string): Promise<Map<string, string>> {
  rmSync(into, { recursive: true, force: true });
  mkdirSync(into, { recursive: true });
  const tarballs = new Map<string, string>();
  for (const name of packages) {
    const folder = join(REPO, "packages", name);
    if (!existsSync(join(folder, "lib")))
      throw new Error(`Build the packages first: npm run build`);
    const printed = await run(["npm", "pack", "--json", "--pack-destination", into], {
      cwd: folder,
    });
    const packed = packedOf(printed, name);
    tarballs.set(packed.name, join(into, packed.filename));
  }
  return tarballs;
}

/* What `npm pack --json` says it packed: the package's name and its tarball. */
function packedOf(printed: string, name: string): { name: string; filename: string } {
  const parsed: unknown = JSON.parse(printed);
  const first: unknown = Array.isArray(parsed) ? parsed[0] : undefined;
  const packageName =
    typeof first === "object" && first !== null ? Reflect.get(first, "name") : undefined;
  const filename =
    typeof first === "object" && first !== null ? Reflect.get(first, "filename") : undefined;
  if (typeof packageName !== "string" || typeof filename !== "string") {
    throw new Error(`npm pack did not say what it packed for packages/${name}`);
  }
  return { name: packageName, filename };
}

function writeManifest(root: string, target: Target, tarballs: ReadonlyMap<string, string>): void {
  const dependencies: Record<string, string> = { ...target.install };
  for (const [name, tarball] of tarballs) dependencies[name] = `file:${tarball}`;
  const manifest = {
    name: `courier-frameworks-${target.id}`,
    private: true,
    type: "module",
    dependencies,
  };
  writeFileSync(join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
