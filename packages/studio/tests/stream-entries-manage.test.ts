/**
 * A stream of events generated as `stream.get(…)` lands in a file generated
 * before streams, which names only `endpoint`: adding it, or merging an
 * update that brings it, names the stream builder too, in whichever way the
 * file names its builders, so the file never references a `stream` it does
 * not declare.
 */
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { appendEndpointsToGroup } from "../src/apis/manage/append-to-group";
import { mergeGroupFile } from "../src/apis/merge/merge-group";
import type { FingerprintResult } from "../src/apis/merge/types";

const PATH = "src/api/shop/orders/index.ts";

function groupFile(preamble: string, entries: string[]): string {
  return [
    'import { courier, defineGroup } from "@noverax/courier/define";',
    "",
    preamble,
    "",
    "export const orders = defineGroup({",
    '  prefix: "/orders",',
    "  endpoints: {",
    ...entries,
    "  },",
    "});",
    "",
  ].join("\n");
}

const LIST = '    list: endpoint.get("").response<unknown>(),';
const WATCH = '    watch: stream.get("events").response<unknown>(),';
const GENERATED = groupFile("const { endpoint, stream } = courier();", [LIST, WATCH]);

function parses(code: string): boolean {
  return parseSync("index.ts", code).errors.length === 0;
}

describe("adding a stream to a file that names only endpoint", () => {
  it("adds stream beside endpoint in the file's destructuring", () => {
    const onDisk = groupFile("const { endpoint } = courier();", [LIST]);

    const merged = appendEndpointsToGroup(PATH, onDisk, GENERATED, ["watch"]);

    expect(merged).toContain("const { endpoint, stream } = courier();");
    expect(merged).toContain('watch: stream.get("events")');
    expect(parses(merged)).toBe(true);
  });

  it("reaches it through a base kept whole", () => {
    const onDisk = groupFile("const api = courier();", [
      '    list: api.endpoint.get("").response<unknown>(),',
    ]);

    const merged = appendEndpointsToGroup(PATH, onDisk, GENERATED, ["watch"]);

    expect(merged).toContain('watch: api.stream.get("events")');
    expect(merged).toContain("const api = courier();");
  });

  it("takes another name when the file binds stream for something else", () => {
    const onDisk = [
      'import { stream } from "./streams";',
      groupFile("const { endpoint } = courier();", [LIST]),
    ].join("\n");

    const merged = appendEndpointsToGroup(PATH, onDisk, GENERATED, ["watch"]);

    expect(merged).toContain("const { endpoint, stream: stream2 } = courier();");
    expect(merged).toContain('watch: stream2.get("events")');
  });

  it("uses the stream builder the file already names", () => {
    const onDisk = groupFile("const { endpoint, stream: events } = courier();", [LIST]);

    const merged = appendEndpointsToGroup(PATH, onDisk, GENERATED, ["watch"]);

    expect(merged).toContain('watch: events.get("events")');
    expect(merged).toContain("const { endpoint, stream: events } = courier();");
  });
});

describe("merging an update that brings a first stream", () => {
  const fingerprints: FingerprintResult = {
    endpoints: { list: "safe", watch: "new" },
    existingCode: {},
  };

  it("names stream in the file's destructuring", () => {
    const onDisk = groupFile("const { endpoint } = courier();", [LIST]);

    const { content } = mergeGroupFile(onDisk, GENERATED, fingerprints);

    expect(content).toContain("const { endpoint, stream } = courier();");
    expect(content).toContain('watch: stream.get("events")');
    expect(parses(content)).toBe(true);
  });

  it("reaches it through a base kept whole", () => {
    const onDisk = groupFile("const api = courier();", [
      '    list: api.endpoint.get("").response<unknown>(),',
    ]);

    const { content } = mergeGroupFile(onDisk, GENERATED, fingerprints);

    expect(content).toContain('watch: api.stream.get("events")');
    expect(content).not.toContain("const { stream }");
  });
});
