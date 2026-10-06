import { createRequire } from "node:module";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import type { InstalledPackage } from "./installed-package";

const log = createLogger("Studio");

/** How a tool's command is started: the program, and the arguments before the tool's own. */
export interface ToolCommand {
  program: string;
  prefix: string[];
}

/* The package each platform's Biome comes in, as Biome's own launcher picks it. */
function nativePackages(): string[] {
  const { platform, arch } = process;
  const ext = platform === "win32" ? ".exe" : "";
  if (platform !== "linux") return [`@biomejs/cli-${platform}-${arch}/biome${ext}`];
  /* Node reports the C library it runs on; none on musl, as Alpine has. */
  const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } };
  const musl = report?.header?.glibcVersionRuntime === undefined;
  const gnu = `@biomejs/cli-linux-${arch}/biome`;
  const alpine = `@biomejs/cli-linux-${arch}-musl/biome`;
  return musl ? [alpine, gnu] : [gnu, alpine];
}

/**
 * How to start the project's Biome: its native program, which Biome's npm
 * package installs beside it for the platform, started directly — Biome's
 * launcher is a Node script that starts the same program, so going through
 * it cost a Node start on every file, twice the time of the formatting. A
 * `BIOME_BINARY` the environment names wins, as it does for the launcher;
 * the launcher is the fallback where no native program resolves.
 *
 * @param biome - The `@biomejs/biome` package the project installed
 * @returns The command, or `null` when the package has neither
 * @example
 * ```ts
 * biomeCommand(installedPackage(root, "@biomejs/biome")!); // { program: ".../cli-darwin-arm64/biome", prefix: [] }
 * ```
 */
export function biomeCommand(biome: InstalledPackage): ToolCommand | null {
  const pinned = process.env.BIOME_BINARY;
  if (pinned) return { program: pinned, prefix: [] };
  const require = createRequire(join(biome.dir, "package.json"));
  for (const native of nativePackages()) {
    try {
      return { program: require.resolve(native), prefix: [] };
    } catch (error) {
      log.debug(`${native} does not resolve beside Biome`, error);
    }
  }
  const bin: unknown = biome.manifest.bin;
  const named: unknown = typeof bin === "object" && bin !== null ? Reflect.get(bin, "biome") : bin;
  return typeof named === "string"
    ? { program: process.execPath, prefix: [join(biome.dir, named)] }
    : null;
}
