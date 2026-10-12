/**
 * A merge that brings a file its first stream of events names the stream
 * builder where the file's syntax builds its endpoints: beside them in the
 * `courier()` call the file destructures, never in a comment that only
 * reads like that call.
 */
import { describe, expect, it } from "vitest";

import { readLayout } from "../../../src/apis/merge/declaration-layout";
import { withStreamBuilder } from "../../../src/apis/merge/stream-preamble";

function file(preamble: string): string {
  return `import { courier, defineGroup } from "@noverax/courier/define";

${preamble}

/** The users. */
export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    list: endpoint.get(""),
  },
});
`;
}

function streamed(content: string): string {
  const layout = readLayout(content);
  if (layout === null) throw new Error("the fixture has no layout");
  return withStreamBuilder(layout);
}

describe("withStreamBuilder", () => {
  it("adds the builder to the courier() call the file destructures, not to a comment like it", () => {
    const content = file(
      "// const { endpoint: hijack } = courier(\nconst { endpoint } = courier();",
    );

    const text = streamed(content);

    expect(text).toContain("// const { endpoint: hijack } = courier(\n");
    expect(text).toContain("const { endpoint, stream } = courier();");
  });

  it("puts the builder before a rest element, which has to come last", () => {
    expect(streamed(file("const { endpoint, ...others } = courier();"))).toContain(
      "const { endpoint, stream, ...others } = courier();",
    );
  });

  it("declares the builder above the declaration and its comment when the file destructures none", () => {
    const text = streamed(file("const api = courier();\nconst endpoint = api.endpoint;"));

    expect(text).toContain(
      "const { stream } = courier();\n\n/** The users. */\nexport const users",
    );
  });
});
