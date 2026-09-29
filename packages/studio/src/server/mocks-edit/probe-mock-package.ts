import { join } from "node:path";
import { createConfigJiti } from "@noverax/courier-studio-core/config";
import { describeError } from "../describe-error";
import { messageOf } from "../message-of";
import { installCommand } from "./install-command";
import { MOCK_PACKAGE } from "./mock-package";
import { MocksEditRefusal } from "./mocks-edit-refusal";

const REQUIRED_EXPORTS: ReadonlyArray<string> = ["defineMockServer", "defineMocks"];

/**
 * Check the mocks file Studio would write can import `@noverax/courier-mock`:
 * the package is loaded from where that file lives, with the default-export
 * interop the file is loaded with, and fresh each time, so a package
 * installed or repaired since the last check is seen.
 *
 * It is loaded without the project's tsconfig path aliases, so only the
 * installed package can load. An alias such as `@noverax/*` → `./src/*`
 * would send the import — and every import inside the package — to the
 * project's own sources: Studio would run a project file before the user
 * confirmed anything, and call a package installed that is not. No project
 * file is evaluated.
 *
 * @param directory - The project root, where the mocks file lives
 * @returns Once the package loaded and exports what a mocks file uses
 * @throws {MocksEditRefusal} `MOCK_PACKAGE_UNLOADABLE`, with what failed and the command that installs it
 * @example
 * ```ts
 * await probeMockPackage(root);
 * ```
 */
export async function probeMockPackage(directory: string): Promise<void> {
  let namespace: unknown;
  try {
    namespace = await loadInstalledPackage(directory);
  } catch (error) {
    throw unloadable(directory, describeError(firstLineOf(error), directory), error);
  }
  const missing = missingExports(namespace);
  if (missing.length > 0) throw unloadable(directory, `it does not export ${missing.join(" or ")}`);
}

async function loadInstalledPackage(directory: string): Promise<unknown> {
  const jiti = await createConfigJiti(join(directory, "courier.mocks.ts"), { aliases: false });
  return jiti.import<unknown>(MOCK_PACKAGE);
}

function missingExports(namespace: unknown): string[] {
  const exports = typeof namespace === "object" && namespace !== null ? namespace : {};
  return REQUIRED_EXPORTS.filter((name) => typeof Reflect.get(exports, name) !== "function");
}

/* A loader's message goes on with a require stack naming the mocks file,
   which need not exist yet; its first line is the part that explains. */
function firstLineOf(error: unknown): string {
  const message = messageOf(error);
  return (message.split("\n", 1)[0] ?? "").replace(/\.$/, "");
}

function unloadable(directory: string, reason: string, cause?: unknown): MocksEditRefusal {
  return new MocksEditRefusal(
    "MOCK_PACKAGE_UNLOADABLE",
    `Studio could not load ${MOCK_PACKAGE} in this project: ${reason}. Install it with ${installCommand(directory)}, then ask again.`,
    { cause },
  );
}
