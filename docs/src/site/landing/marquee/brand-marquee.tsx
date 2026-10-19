import { cn } from "@/site/cn"
import type { Brand } from "@/site/landing/brands"
import { ADAPTER_BRANDS, RUNTIME_BRANDS } from "@/site/landing/brands"
import { BrandSymbols } from "./brand-symbols"
import { BrandTile } from "./brand-tile"

const EDGES =
  "relative [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]"

function MarqueeRow({ brands, reverse }: { brands: readonly Brand[]; reverse?: boolean }) {
  const run = ["a", "b"].flatMap((round) =>
    brands.map((brand) => ({ key: `${round}-${brand.name}`, brand }))
  )
  return (
    <div aria-hidden="true" className={EDGES}>
      <div
        className={cn(
          "flex w-max will-change-transform hover:[animation-play-state:paused] motion-reduce:animate-none",
          reverse ? "animate-marquee-reverse" : "animate-marquee"
        )}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-3 pr-3">
            {run.map(({ key, brand }) => (
              <BrandTile key={key} brand={brand} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The frameworks Courier mounts in and the places its calls run, as two
 * rows drifting in opposite directions; a hovered row stops, and a reader
 * who asked for less motion sees them still.
 *
 * @returns The section
 * @example
 * ```tsx
 * <BrandMarquee />
 * ```
 */
export function BrandMarquee() {
  return (
    <section aria-label="Frameworks and runtimes" className="overflow-hidden pt-18">
      <div className="mx-auto mb-6.5 flex max-w-[1200px] flex-col items-center gap-2.5 px-5 text-center">
        <p className="m-0 flex items-center gap-2.5 font-mono text-[11px] tracking-[0.1em] text-fg-subtle">
          <span
            aria-hidden="true"
            className="h-px w-7 bg-[linear-gradient(90deg,transparent,var(--color-line-strong))]"
          />
          WORKS WHERE YOU ALREADY ARE
          <span
            aria-hidden="true"
            className="h-px w-7 bg-[linear-gradient(90deg,var(--color-line-strong),transparent)]"
          />
        </p>
        <p className="m-0 max-w-[52ch] text-[15.5px] leading-[1.55] text-fg-muted">
          Ten official server adapters, each one line to mount — and any client that can call{" "}
          <code className="text-[14px] text-brand">fetch</code>.
        </p>
      </div>
      <ul className="sr-only">
        {[...ADAPTER_BRANDS, ...RUNTIME_BRANDS].map((brand) => (
          <li key={brand.name}>
            {brand.name}: {brand.sub}
          </li>
        ))}
      </ul>
      <BrandSymbols brands={[...ADAPTER_BRANDS, ...RUNTIME_BRANDS]} />
      <div className="flex flex-col gap-3">
        <MarqueeRow brands={ADAPTER_BRANDS} />
        <MarqueeRow brands={RUNTIME_BRANDS} reverse />
      </div>
    </section>
  )
}
