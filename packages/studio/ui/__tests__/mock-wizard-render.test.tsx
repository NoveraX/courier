/**
 * What the mock wizard shows of Studio's answers is text: a line of the
 * mocks file, a line Studio added, or the mocks file's load error renders
 * as the characters it holds, never as markup.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MocksFileBanner } from "../src/views/mocks/shared/mocks-file-banner";
import { ConfigDiff } from "../src/views/mocks/wizard/config-diff";
import { InsertedLinesList } from "../src/views/mocks/wizard/inserted-lines-list";
import { ReviewReady } from "../src/views/mocks/wizard/review-ready";

const MARKUP = '<img src=x onerror="alert(1)">';
const ESCAPED = "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;";

describe("text from Studio", () => {
  it("renders a diff line as text", () => {
    const html = renderToStaticMarkup(
      <ConfigDiff
        target="courier.mocks.ts"
        hunks={[
          {
            lines: [
              { kind: "context", text: "// the team's mocks", oldLine: 1, newLine: 1 },
              {
                kind: "add",
                text: `  api: defineMockServer({ source }), // ${MARKUP}`,
                oldLine: null,
                newLine: 2,
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain(ESCAPED);
    expect(html).not.toContain("<img");
    expect(html).toContain("+1");
  });

  it("renders the lines Studio added as text", () => {
    const html = renderToStaticMarkup(
      <InsertedLinesList lines={[{ line: 3, text: `x, ${MARKUP}`, added: MARKUP }]} />,
    );

    expect(html).toContain(ESCAPED);
    expect(html).not.toContain("<img");
  });

  it("names the mocks file that does not load and why, as text", () => {
    const html = renderToStaticMarkup(
      <MocksFileBanner
        status={{ file: "/project/courier.mocks.ts", error: `ParseError: ${MARKUP}` }}
      />,
    );

    expect(html).toContain("courier.mocks.ts does not load");
    expect(html).toContain(`ParseError: ${ESCAPED}`);
    expect(html).not.toContain("<img");
  });

  it("shows no banner while the mocks file loads, or before Studio says how it loads", () => {
    expect(
      renderToStaticMarkup(
        <MocksFileBanner status={{ file: "/project/courier.mocks.ts", error: null }} />,
      ),
    ).toBe("");
    expect(renderToStaticMarkup(<MocksFileBanner status={null} />)).toBe("");
  });
});

describe("the change to confirm", () => {
  it("does not say nothing else changes when the plan also changes the file's imports", () => {
    const html = renderToStaticMarkup(
      <ReviewReady
        mockCount={1}
        changedOnDisk={false}
        outcome={{
          status: "ready",
          target: "courier.mocks.ts",
          creates: false,
          baseHash: "a".repeat(64),
          planDigest: "b".repeat(64),
          warnings: [],
          hunks: [
            {
              lines: [
                {
                  kind: "remove",
                  text: 'import { defineMocks } from "@noverax/courier-mock";',
                  oldLine: 1,
                  newLine: null,
                },
                {
                  kind: "add",
                  text: 'import { defineMocks, defineMockServer } from "@noverax/courier-mock";',
                  oldLine: null,
                  newLine: 1,
                },
                {
                  kind: "add",
                  text: 'import courierConfig from "./courier.config";',
                  oldLine: null,
                  newLine: 2,
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Adds 1 mock to courier.mocks.ts");
    expect(html).not.toContain("Nothing else");
    expect(html).toContain("−1");
  });
});
