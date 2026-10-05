import { HardDrive, PackageX, UserX } from "lucide-react"
import { siNextdotjs, siNuxt, siReact, siSvelte, siVuedotjs } from "simple-icons"

import { highlightTokens } from "@/site/code/highlight-tokens"
import { CONNECTIONS } from "./setup-data"
import type { ShownConnection } from "./setup-wizard"
import { SetupWizard } from "./setup-wizard"

const ICONS: Readonly<Record<string, string>> = {
  react: siReact.path,
  vue: siVuedotjs.path,
  next: siNextdotjs.path,
  nuxt: siNuxt.path,
  sveltekit: siSvelte.path,
}

const PRINCIPLES = [
  {
    icon: PackageX,
    title: "Nothing ships to prod",
    text: "The plugin only runs in development builds.",
  },
  {
    icon: HardDrive,
    title: "Local by default",
    text: "Requests never leave your machine unless you export them.",
  },
  { icon: UserX, title: "No account", text: "No sign-up, no telemetry, no cloud dashboard." },
]

/**
 * How to get Studio running: the three steps, then what it promises about
 * production, your data and your account.
 *
 * @returns The section
 * @example
 * ```tsx
 * <SetupSection />
 * ```
 */
export async function SetupSection() {
  const connections: ShownConnection[] = await Promise.all(
    CONNECTIONS.map(async (connection) => ({
      ...connection,
      icon: ICONS[connection.id] ?? "",
      lines: await highlightTokens(connection.code, "ts"),
    }))
  )
  return (
    <section id="setup" className="pt-[clamp(77px,13vw,128px)]">
      <div className="mx-auto max-w-[1200px] px-5">
        <div className="mb-7.5 flex flex-col gap-3">
          <p className="m-0 font-mono text-[11px] tracking-[0.1em] text-brand">SETUP</p>
          <h2 className="m-0 max-w-[20ch] text-[clamp(27px,3.3vw,40px)] leading-[1.08] font-semibold tracking-[-0.035em]">
            Running in under a minute
          </h2>
          <p className="m-0 max-w-[52ch] text-[16px] leading-[1.6] text-fg-muted">
            Install it, connect your app, start Studio. It opens next to your app.
          </p>
        </div>
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-[8%] inset-x-[10%] bg-[radial-gradient(ellipse_at_center,var(--studio-glow),transparent_70%)] blur-[30px]"
          />
          <SetupWizard connections={connections} />
        </div>
        <ul className="m-0 mt-12 grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6.5 p-0">
          {PRINCIPLES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-brand" />
              <span className="flex flex-col gap-1">
                <span className="text-callout font-semibold">{title}</span>
                <span className="text-nav leading-[1.55] text-fg-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
