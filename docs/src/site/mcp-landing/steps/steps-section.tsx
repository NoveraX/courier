import { CodeLines } from "@/site/code/code-lines"
import { highlightTokens } from "@/site/code/highlight-tokens"

const STEPS = [
  {
    title: "Mark what an agent may call",
    text: "One line on the endpoints you already defined. Everything else stays out of reach.",
    code: [".agent({", '  description: "Every open order",', '  access: "read",', "})"].join("\n"),
    lang: "ts",
  },
  {
    title: "Add it to the agent",
    text: "Your editor's agent starts it over stdio. Your app serves it over HTTP to the rest.",
    code: "claude mcp add courier -- npx courier-mcp",
    lang: "bash",
  },
  {
    title: "Watch every call",
    text: "Each call runs through your middleware and lands in Studio, marked agent.",
    code: "npx courier-studio",
    lang: "bash",
  },
] as const

/**
 * How the MCP server is put to work, in the order it is: mark the
 * endpoints, add the server to an agent, watch the calls in Studio.
 *
 * @returns The section
 * @example
 * ```tsx
 * <StepsSection />
 * ```
 */
export async function StepsSection() {
  const snippets = await Promise.all(STEPS.map((step) => highlightTokens(step.code, step.lang)))
  return (
    <section id="how" data-tone="violet" className="pt-[clamp(72px,12vw,120px)]">
      <div className="mx-auto max-w-[1200px] px-5">
        <h2 className="m-0 max-w-[18ch] text-[clamp(28px,3.4vw,42px)] leading-[1.06] font-semibold tracking-[-0.035em]">
          From a definition to an agent's tools in three steps
        </h2>
        <ol className="m-0 mt-9 grid list-none grid-cols-1 gap-4 p-0 min-[900px]:grid-cols-3">
          {STEPS.map((step, at) => (
            <li
              key={step.title}
              className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-[linear-gradient(180deg,var(--color-panel),var(--color-bg-subtle))] p-5.5"
            >
              <span className="font-mono text-[11px] tracking-[0.1em] text-(--tone)">
                STEP {at + 1}
              </span>
              <h3 className="m-0 text-[19px] leading-[1.25] font-semibold tracking-[-0.022em]">
                {step.title}
              </h3>
              <p className="m-0 text-callout text-fg-muted">{step.text}</p>
              <div className="mt-auto overflow-x-auto rounded-[10px] border border-line bg-bg-subtle">
                <CodeLines
                  lines={snippets[at] ?? []}
                  className="m-0 px-3.5 py-3 text-[12px] leading-[1.7] text-code-plain"
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
