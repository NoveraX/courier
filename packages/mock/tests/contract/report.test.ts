import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createContractReport } from "../../src/contract/report";
import { validateSource } from "../../src/contract/validator";

const { endpoint } = courier();
const User = z.object({ id: z.number(), name: z.string() });

const users = defineGroup({
  prefix: "users",
  endpoints: {
    withSchema: endpoint.get("").response(User),
    withoutSchema: endpoint.get("bare"),
  },
});

const api = defineApi({ baseURL: "http://placeholder.invalid", groups: { users } });

async function reportOfSkips() {
  return createContractReport(await validateSource(api, new Map(), { direction: "both" }));
}

describe("contract report skip reasons", () => {
  it("says in TAP why each check was skipped", async () => {
    const tap = (await reportOfSkips()).toTAP();

    expect(tap).toContain("ok 1 - users.withSchema (response) # SKIP no mock data");
    expect(tap).toContain("ok 2 - users.withSchema (variables) # SKIP no variables schema");
    expect(tap).toContain("ok 3 - users.withoutSchema (response) # SKIP no response schema");
  });

  it("gives the reason in JUnit and Markdown", async () => {
    const report = await reportOfSkips();

    expect(report.toJUnit()).toContain(
      '<testcase name="users.withSchema (response)"><skipped message="no mock data" /></testcase>',
    );
    expect(report.toMarkdown()).toContain("`users.withSchema` (response) — no mock data");
  });

  it("marks a skip that gives no reason without inventing one", () => {
    const tap = createContractReport([
      { group: "users", method: "list", status: "skip", target: "response" },
    ]).toTAP();

    expect(tap).toContain("ok 1 - users.list (response) # SKIP");
    expect(tap).not.toContain("no schema");
  });
});
