import { CodeTabs } from "@/site/code/code-tabs"
import { highlight } from "@/site/code/highlight"

interface CodeGroupItem {
  label: string
  code: string
  language?: string | undefined
}

/**
 * A page's tabbed code — the same command for each package manager, the
 * same setup for each framework — each tab highlighted on the server.
 *
 * @param props - The tabs: a label, the code and its language
 * @returns The tabbed panel
 * @example
 * ```tsx
 * <CodeGroup items={[{ label: "npm", code: "npm install @noverax/courier", language: "bash" }]} />
 * ```
 */
export async function CodeGroup({ items }: { items: readonly CodeGroupItem[] }) {
  const tabs = await Promise.all(
    items.map(async ({ label, code, language = "ts" }) => ({
      label,
      code,
      html: await highlight(code, language),
    }))
  )
  return (
    <div className="my-5">
      <CodeTabs tabs={tabs} />
    </div>
  )
}
