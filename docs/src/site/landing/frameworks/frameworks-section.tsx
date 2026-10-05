import { highlightTokens } from "@/site/code/highlight-tokens"
import { ADAPTER_BRANDS } from "@/site/landing/brands"
import type { ShownAdapter } from "./adapter-picker"
import { AdapterPicker } from "./adapter-picker"
import { ADAPTERS, landingAdapters } from "./adapters"

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-[26px] leading-none font-medium tracking-[-0.03em]">
        {value}
      </div>
      <div className="mt-1.5 text-small text-fg-subtle">{label}</div>
    </div>
  )
}

/**
 * The frameworks Courier mounts in: how many, how little differs between
 * them, and the most used adapters' mounts beside the list, with the way to
 * every other.
 *
 * @returns The section
 * @example
 * ```tsx
 * <FrameworksSection />
 * ```
 */
export async function FrameworksSection() {
  const adapters: ShownAdapter[] = await Promise.all(
    landingAdapters().map(async (adapter) => ({
      ...adapter,
      icon: ADAPTER_BRANDS.find((brand) => brand.name === adapter.label)?.path ?? "",
      lines: await highlightTokens(adapter.code, "ts"),
    }))
  )
  return (
    <section id="frameworks" className="pt-28">
      <div className="mx-auto max-w-[1200px] px-5">
        <div className="mb-8.5 grid grid-cols-1 items-end gap-4.5 min-[900px]:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <h2 className="m-0 max-w-[18ch] animate-rise text-[clamp(27px,3.3vw,40px)] leading-[1.08] font-semibold tracking-[-0.035em]">
              Your framework is already supported
            </h2>
            <p className="mt-3.5 mb-0 max-w-[54ch] animate-rise text-[16px] leading-[1.6] text-fg-muted">
              Every adapter handler is zero-argument — it reads sources from the registry. Switch
              frameworks: only the import and one call change.
            </p>
          </div>
          <div className="flex gap-7">
            <Stat value={String(ADAPTERS.length)} label="official adapters" />
            <Stat value="2" label="lines that differ" />
            <Stat value="0" label="handler arguments" />
          </div>
        </div>
        <AdapterPicker adapters={adapters} total={ADAPTERS.length} />
      </div>
    </section>
  )
}
