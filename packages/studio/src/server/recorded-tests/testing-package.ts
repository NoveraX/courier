import { readFileSync } from "node:fs";
import { join } from "node:path";
import { messageOf } from "@noverax/courier-cli/devkit";
import type * as Testing from "@noverax/courier-mock/testing";
import { devInstallCommand } from "../mocks-edit/install-command";
import { RecordedTestRefusal } from "./recorded-test-refusal";

/* What a recorded test imports, which the project must have. */
const NEEDED = ["vitest", "@noverax/courier-mock"] as const;

let testing: Promise<typeof Testing> | undefined;

/**
 * The mock package's testing tools, which write the recordings and check
 * them — loaded when first asked for, since Studio runs without the mock.
 *
 * @param root - The project root, for the command that installs the package
 * @returns The tools
 * @throws {RecordedTestRefusal} `MOCK_PACKAGE_MISSING`, with the command that installs it
 * @example
 * ```ts
 * const { verifyRecordings } = await loadTesting(root);
 * ```
 */
export async function loadTesting(root: string): Promise<typeof Testing> {
  testing ??= import("@noverax/courier-mock/testing");
  try {
    return await testing;
  } catch (error) {
    testing = undefined;
    const reason = (messageOf(error).split("\n", 1)[0] ?? "").replace(/\.$/, "");
    throw new RecordedTestRefusal(
      "MOCK_PACKAGE_MISSING",
      `A recorded test needs @noverax/courier-mock, which could not be loaded: ${reason}. Install it with ${devInstallCommand(root, "@noverax/courier-mock")}, then ask again.`,
      { cause: error },
    );
  }
}

/**
 * The command that installs what a recorded test imports and the project's
 * `package.json` does not list — vitest, the mock package — or none.
 *
 * @param root - The project root
 * @returns The command, alone in the list, or an empty list
 * @example
 * ```ts
 * missingPackages(root); // ["npm install --save-dev vitest"]
 * ```
 */
export function missingPackages(root: string): string[] {
  const listed = listedPackages(root);
  const missing = NEEDED.filter((name) => !listed.has(name));
  return missing.length === 0 ? [] : [devInstallCommand(root, missing.join(" "))];
}

function listedPackages(root: string): Set<string> {
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (typeof manifest !== "object" || manifest === null) return new Set();
    const { dependencies, devDependencies } = manifest as Record<string, unknown>;
    return new Set([
      ...Object.keys(asRecord(dependencies)),
      ...Object.keys(asRecord(devDependencies)),
    ]);
  } catch {
    /* A project without a readable package.json lists nothing: each package is named to install. */
    return new Set();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
