/**
 * The block Docs for Your Agent shows for AGENTS.md is Courier's own, as
 * create-courier writes it and Studio keeps it up to date: a reader who
 * copies it from the page holds the block the commands recognise.
 */
import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { AGENT_RULES } from "../../../packages/create-courier/src/agent-rules/rules-text"

const PAGE = path.join(process.cwd(), "src/content/docs/agents/docs.mdx")

describe("Docs for Your Agent", () => {
  it("shows Courier's block for AGENTS.md as the commands write it", () => {
    const source = fs.readFileSync(PAGE, "utf8")
    const sample = /```markdown title="AGENTS\.md"\n([\s\S]*?)\n```/.exec(source)?.[1]

    expect(sample).toBe(AGENT_RULES)
  })
})
