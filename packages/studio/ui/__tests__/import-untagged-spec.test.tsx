/**
 * @vitest-environment jsdom
 *
 * A specification that tags none of its operations is grouped by path
 * unless the settings ask otherwise, since by tag no endpoint would be in a
 * group; the Configure step says so when tag is chosen anyway.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildPostParseState } from "@/apis/import-actions";
import type { GenerateOptions, ParsedSpec } from "@/features/apis/types";
import { GenerationStep } from "@/screens/apis/import/generation-step";

const SPEC: ParsedSpec = {
  title: "Pay",
  version: "1",
  description: "",
  baseURL: "https://pay.example",
  format: "openapi3",
  groups: [],
  schemas: {},
  securitySchemes: [],
  skipped: [],
};
const SETTINGS = {
  apisValidation: "zod",
  apisGroupBy: "tag",
  apisGenerateTypes: true,
  apisGenerateSchemas: true,
  apisIncludeComments: true,
  apisClient: "direct",
} as Parameters<typeof buildPostParseState>[1];

afterEach(cleanup);

describe("importing a specification that tags no operation", () => {
  it("groups by path where the settings group by tag", () => {
    const state = buildPostParseState({ ...SPEC, untagged: true }, SETTINGS);

    expect(state.options?.groupBy).toBe("path");
  });

  it("keeps the grouping the settings ask for otherwise, and tag for a tagged spec", () => {
    const single = buildPostParseState(
      { ...SPEC, untagged: true },
      { ...SETTINGS, apisGroupBy: "single" },
    );
    const tagged = buildPostParseState(SPEC, SETTINGS);

    expect(single.options?.groupBy).toBe("single");
    expect(tagged.options?.groupBy).toBe("tag");
  });

  it("says by tag puts no endpoint in a group when tag is chosen for it anyway", () => {
    const options = buildPostParseState({ ...SPEC, untagged: true }, SETTINGS)
      .options as GenerateOptions;

    render(
      <GenerationStep
        options={{ ...options, groupBy: "tag" }}
        error={null}
        untagged
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("no endpoint has a tag: by tag, none goes in a group")).toBeTruthy();
  });

  it("says how endpoints split into files once path is chosen", () => {
    const options = buildPostParseState({ ...SPEC, untagged: true }, SETTINGS)
      .options as GenerateOptions;

    render(<GenerationStep options={options} error={null} untagged onChange={() => {}} />);

    expect(screen.getByText("how endpoints split into files")).toBeTruthy();
  });
});
