import { accessSync, constants } from "node:fs";
import { errnoCode } from "@noverax/courier-cli/devkit";
import { MocksEditRefusal } from "./mocks-edit-refusal";

/**
 * Refuse the edit when this process may not write a file or directory it
 * needs to.
 *
 * @param path - The file or directory
 * @param subject - How the message names it, such as `courier.mocks.ts`
 * @param consequence - What that stops, as a sentence
 * @throws {MocksEditRefusal} `MOCKS_NOT_WRITABLE`, naming the subject and the error code
 * @example
 * ```ts
 * checkWriteAccess(root, `the project directory ${root}`, "Studio creates courier.mocks.ts there.");
 * ```
 */
export function checkWriteAccess(path: string, subject: string, consequence: string): void {
  try {
    accessSync(path, constants.W_OK);
  } catch (error) {
    const code = errnoCode(error) ?? "an unknown error";
    throw new MocksEditRefusal(
      "MOCKS_NOT_WRITABLE",
      `Studio may not write ${subject} (${code}). ${consequence}`,
      { cause: error },
    );
  }
}
