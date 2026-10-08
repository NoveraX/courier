/** What a recorded test's file is written from. */
export interface TestFileParts {
  /** What the test is called: the session's name, or the one given */
  title: string;
  /** The day the first call was made: `2026-10-09` */
  recordedOn: string;
  /** The config's module, from the test's folder: `../../courier.config` */
  configImport: string;
  /** The recordings' files, beside the test: `checkout-flow.shop.har` */
  recordings: readonly string[];
}

/**
 * The text of a test that checks calls recorded in Studio against the API
 * definition as it is now: it reads the recordings beside it, checks them
 * against the sources `courier.config` declares, and fails a call's test
 * for each way the definition no longer fits it. Every name the session
 * supplied is written as a JSON string, so none can end one early.
 *
 * @param parts - The title, the day, the config's module and the recordings
 * @returns The file's text, before the project's formatter lays it out
 * @example
 * ```ts
 * testFileText({ title: "Checkout", recordedOn: "2026-10-09", configImport: "../../courier.config", recordings: ["checkout.shop.har"] });
 * ```
 */
export function testFileText(parts: TestFileParts): string {
  const reads = parts.recordings
    .map((file) => `  ...readRecordings(new URL(${JSON.stringify(`./${file}`)}, import.meta.url)),`)
    .join("\n");
  return `/**
 * Calls recorded in Courier Studio on ${parts.recordedOn}, checked against the
 * API definition as it is now. A call fails its test when its endpoint is
 * gone, its method or route changed, or its schemas refuse the variables it
 * was sent with or the answer it got. Run it in CI with the rest, or check
 * every recording at once with \`npx courier-studio verify\`.
 */
import { readRecordings, verifyRecordings } from "@noverax/courier-mock/testing";
import { describe, expect, it } from "vitest";

import config from ${JSON.stringify(parts.configImport)};

const recordings = [
${reads}
];
const checks = await verifyRecordings((await config).sources, recordings);

describe(${JSON.stringify(`${parts.title}, as recorded`)}, () => {
  it.each(checks)("$label", ({ problems }) => {
    expect(problems).toEqual([]);
  });
});
`;
}
