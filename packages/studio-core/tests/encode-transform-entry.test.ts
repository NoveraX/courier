/**
 * @vitest-environment node
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { encodeTransformEntry } from "../src/runtime/encode-transform-entry";
import { TRANSFORM_ENTRY_FORMAT } from "../src/runtime/transform-entry-format";

const DIGEST = "a".repeat(64);
const CODE = 'exports.greeting = "héllo, world";\n';

describe("encodeTransformEntry", () => {
  it("heads the code with the input digest and the body's byte length and sha256", () => {
    const body = Buffer.from(CODE, "utf8");
    const sha = createHash("sha256").update(body).digest("hex");

    const entry = encodeTransformEntry(DIGEST, CODE);

    expect(entry.toString("utf8")).toBe(
      `// courier-transform 2 ${DIGEST} ${body.length} ${sha}\n${CODE}`,
    );
    expect(entry.toString("latin1").startsWith(TRANSFORM_ENTRY_FORMAT.prefix)).toBe(true);
  });
});
