import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { createLogger } from "@noverax/courier";
import { writeFileAtomically } from "@noverax/courier-cli/devkit";
import { ensureCourierDir } from "../courier-dir";
import { studioVersion } from "../studio-version";

const log = createLogger("Studio");

/** The file in `.courier` that says where the project's Studio runs, while it does. */
export const ADDRESS_FILE = "studio.json";

/** Where a running Studio answers, as an editor reads it. */
export interface StudioAddress {
  readonly url: string;
  readonly pid: number;
  readonly version: string;
}

/**
 * Write where the project's Studio runs to `.courier/studio.json`, for an
 * editor to find it, and return what takes it away again — only while the
 * file is still this Studio's, so a second Studio started since keeps its own.
 *
 * @param root - The project's root
 * @param address - Where Studio answers, its process and its version
 * @returns What removes the file when Studio stops
 * @example
 * ```ts
 * const forget = announceStudioAddress(root, { url, pid: process.pid, version });
 * await studio.close();
 * forget();
 * ```
 */
export function announceStudioAddress(root: string, address: StudioAddress): () => void {
  let file: string;
  try {
    /* A `.courier` that is a link or no folder is refused here as everywhere: Studio writes nothing there. */
    file = join(ensureCourierDir(root), ADDRESS_FILE);
    writeFileAtomically(file, `${JSON.stringify(address, null, 2)}\n`, ".studio-address");
  } catch (error) {
    log.warn("Could not write where Studio runs for editors to find it", error);
    return () => undefined;
  }
  return () => {
    try {
      const written: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (
        typeof written === "object" &&
        written !== null &&
        "pid" in written &&
        written.pid === address.pid
      ) {
        rmSync(file, { force: true });
      }
    } catch (error) {
      log.debug("The file that says where Studio runs was already gone", error);
    }
  };
}

/** Studio's address file, written once Studio listens and taken away when it stops. */
export interface AddressFile {
  /** Wrap what is told when Studio listens, so the file is written first */
  announcing(next: ((url: string) => void) | undefined): (url: string) => void;
  /** Take the file away, if it is still this Studio's */
  forget(): void;
}

/**
 * Studio's address file for a project — or nothing at all, for a Studio
 * that serves a public demo, which no one's editor reads.
 *
 * @param root - What says the project's root, read once Studio listens
 * @param enabled - Whether to write the file
 * @returns What writes and removes it
 * @example
 * ```ts
 * const address = studioAddressFile(() => root, !demo);
 * createStudioStartup(server, { ...options, onReady: address.announcing(options.onReady) });
 * ```
 */
export function studioAddressFile(root: () => string, enabled: boolean): AddressFile {
  let forget = (): void => undefined;
  return {
    announcing: (next) => (url) => {
      if (enabled) {
        forget = announceStudioAddress(root(), { url, pid: process.pid, version: studioVersion() });
      }
      next?.(url);
    },
    forget: () => forget(),
  };
}
