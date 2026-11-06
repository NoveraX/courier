import { createTerminalStyle } from "@noverax/courier/internal";
import { afterAll, describe, expect, it } from "vitest";

import { addCourier } from "../../src/add-courier";
import { textReport } from "../../src/report/text-report";
import { manifest, projectWith, removeProjects } from "../recipes/project-fixture";
import { scripted } from "./scripted-questions";

afterAll(removeProjects);

function nextApp(): string {
  return projectWith({
    "package.json": manifest({ next: "16.4.0", react: "19.2.0", "react-dom": "19.2.0" }),
    "tsconfig.json": "{}",
    "next.config.ts": "export default {};\n",
    "src/app/page.tsx": "export default function Home() { return null; }\n",
  });
}

describe("a setup in a terminal", () => {
  it("asks every question before it shows the plan, which follows the answers, and asks last to go ahead", async () => {
    const printed: string[] = [];
    const questions = scripted(["example", false, false, "plugin", false]);
    const report = textReport(createTerminalStyle(0, false), (lines) => {
      printed.push(...lines);
    });

    const status = await addCourier(nextApp(), {}, { questions, report, toolOutput: "stdout" });

    expect(questions.asked.map((each) => each.message)).toEqual([
      "Your API?",
      "Set Courier Studio up, to watch your API's calls?",
      "Offer the API's reads to AI agents in your editor, over MCP?",
      "Where do pages take their routes from?",
      "Set Courier up?",
    ]);
    expect(status).toBe(1);
    const plan = printed.join("\n");
    expect(plan).toContain(
      "The example has no mock without Studio, which runs it: it calls your backend.",
    );
    expect(plan).toContain("src/courier/api.ts");
    expect(plan).not.toContain("courier.mocks.ts");
    expect(plan).toContain("Nothing was changed.");
  });
});
