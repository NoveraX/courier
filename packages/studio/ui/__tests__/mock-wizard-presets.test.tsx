/**
 * The Configure step lists the scenarios every mock serves. Each line says
 * what the scenario does: slow-network delays the read endpoints only, not
 * every endpoint.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_WIZARD_STATE } from "../src/features/mocks/wizard/wizard-reducer";
import { ConfigureStep } from "../src/views/mocks/wizard/step-configure";

function presetLine(name: string): string {
  const html = renderToStaticMarkup(
    <ConfigureStep
      state={INITIAL_WIZARD_STATE}
      errors={new Map()}
      onEdit={() => {}}
      onRemove={() => {}}
    />,
  );
  const line = html.split("<li>").find((item) => item.includes(`>${name}<`));
  return line?.replace(/<[^>]+>/g, "") ?? "";
}

describe("the built-in scenarios the wizard lists", () => {
  it("says slow-network adds 3G latency to the read endpoints", () => {
    expect(presetLine("slow-network")).toBe("slow-network — 3G latency on read endpoints");
  });
});
