/**
 * Publish the editor extensions to the Visual Studio Marketplace, and to
 * Open VSX, where Cursor, Windsurf and VSCodium find them.
 *
 * Usage:
 *   tsx scripts/publish-extensions.ts [--dry-run]
 *   tsx scripts/publish-extensions.ts --identify
 *
 * Run where the released commit is checked out and built: each extension is
 * packaged at the version the release gave it, and an extension another one
 * installs is published first. The Marketplace is signed in to through
 * Microsoft Entra ID — the workflow has signed in to Azure as the publisher's
 * managed identity — and Open VSX with the token in `OVSX_PAT`. A version a
 * marketplace already has is passed over, so a run that failed half-way is
 * simply run again. `--identify` prints the id the Marketplace knows the
 * managed identity by, which the publisher adds as a member once.
 */
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extensionDirs, orderByDependency, readPkg } from "./release-order";

/** An extension, as its manifest describes it. */
export interface Extension {
  /** `publisher.name`, the id the marketplaces know it by */
  id: string;
  publisher: string;
  /** The npm workspace that packages it */
  workspace: string;
  /** Where its `package` script writes the package */
  vsix: string;
  /** The extensions it installs, by id */
  installs: string[];
}

/* The Azure DevOps application, whose token the Marketplace's profile service takes. */
const AZURE_DEVOPS = "499b84ac-1321-427f-aa17-267ca6975798";
const PROFILE =
  "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1-preview.3";

/**
 * An extension, read from its folder.
 *
 * @param dir - The extension's package folder
 * @returns What publishing it needs
 * @throws When its `package` script does not say where the package goes
 * @example
 * ```ts
 * extensionAt("packages/vscode").vsix; // "packages/vscode/dist/courier.vsix"
 * ```
 */
export function extensionAt(dir: string): Extension {
  const pkg = readPkg(dir);
  const out = /--out\s+(\S+)/.exec(pkg.scripts?.package ?? "")?.[1];
  if (!pkg.publisher || !out) {
    throw new Error(`${dir} names no publisher, or its package script no --out`);
  }
  return {
    id: `${pkg.publisher}.${pkg.name}`,
    publisher: pkg.publisher,
    workspace: pkg.name,
    vsix: join(dir, out),
    installs: [...(pkg.extensionPack ?? []), ...(pkg.extensionDependencies ?? [])],
  };
}

/**
 * Extensions in the order they may be published: one that installs another
 * follows it, so no marketplace offers an extension whose pack it cannot
 * install.
 *
 * @param extensions - The extensions
 * @returns The same, ordered
 */
export function publishingOrder(extensions: readonly Extension[]): Extension[] {
  const byId = new Map(extensions.map((each) => [each.id, each]));
  const needs = new Map(extensions.map((each) => [each.id, each.installs]));
  return orderByDependency(needs).map((id) => byId.get(id) as Extension);
}

/**
 * The command that publishes a package to a marketplace, from the repository's root.
 *
 * @param marketplace - Where it goes
 * @param vsix - The package
 * @returns The command and its arguments
 */
export function publishCommand(marketplace: "marketplace" | "open-vsx", vsix: string): string[] {
  return marketplace === "marketplace"
    ? ["vsce", "publish", "--azure-credential", "--skip-duplicate", "--packagePath", vsix]
    : ["ovsx", "publish", vsix, "--skip-duplicate"];
}

/* The repository's own command lines, never one npx would fetch. */
function run(command: readonly string[]): void {
  execFileSync("npx", ["--no", ...command], { stdio: "inherit" });
}

/* Open VSX takes an extension into a namespace that exists; the first release makes it. */
async function ensureNamespace(publisher: string): Promise<void> {
  const known = await fetch(`https://open-vsx.org/api/${publisher}`);
  if (known.ok) return;
  if (known.status !== 404) throw new Error(`Open VSX answered ${known.status} for ${publisher}`);
  run(["ovsx", "create-namespace", publisher]);
}

/* Publish each package to one marketplace, stopping at the first that fails there. */
function publishTo(
  marketplace: "marketplace" | "open-vsx",
  ordered: readonly Extension[],
): boolean {
  for (const extension of ordered) {
    try {
      run(publishCommand(marketplace, extension.vsix));
    } catch {
      console.error(
        `x ${extension.id} was not published to ${marketplace}; the ones after it wait`,
      );
      return false;
    }
  }
  return true;
}

function identify(): void {
  const id = execFileSync(
    "az",
    [
      ...["rest", "--method", "get", "--url", PROFILE, "--resource", AZURE_DEVOPS],
      ...["--query", "id", "--output", "tsv"],
    ],
    { encoding: "utf8" },
  ).trim();
  console.log(`The Marketplace knows this workflow's identity as ${id}`);
}

async function main(argv: readonly string[]): Promise<void> {
  if (argv.includes("--identify")) return identify();
  const ordered = publishingOrder(extensionDirs().map(extensionAt));
  for (const extension of ordered) {
    execFileSync("npm", ["run", "package", "-w", extension.workspace], { stdio: "inherit" });
  }
  if (argv.includes("--dry-run")) {
    for (const extension of ordered) console.log(`would publish ${extension.vsix}`);
    return;
  }
  if (!process.env.OVSX_PAT) throw new Error("OVSX_PAT holds no Open VSX token");
  const publishers = new Set(ordered.map((extension) => extension.publisher));
  for (const publisher of publishers) await ensureNamespace(publisher);
  const published = [publishTo("marketplace", ordered), publishTo("open-vsx", ordered)];
  if (published.includes(false)) process.exit(1);
}

/* Importing this module must not publish anything: the tests import it. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
