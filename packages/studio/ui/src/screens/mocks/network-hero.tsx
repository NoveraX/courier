import { OctagonX } from "lucide-react";

import { chaosModeOf } from "@/features/mocks/chaos-config";
import { delayLabel, delayOf } from "@/features/mocks/latency-window";
import type { LiveFigure } from "@/features/mocks/network-live";
import { cn } from "@/lib/utils";
import { stopAllFaults } from "@/mocks/stop-all-faults";
import type { MockServerInfo } from "@/store/mock-slice";
import { CHAOS_LOOK } from "./chaos-look";

const SPARK = { brand: "bg-brand", ok: "bg-ok", err: "bg-err", warn: "bg-warn" } as const;
const VALUE = { normal: "text-fg", err: "text-err", warn: "text-warn" } as const;

function conditionOf(server: MockServerInfo): { title: string; sub: string; active: boolean } {
  const look = CHAOS_LOOK[chaosModeOf(server.chaosPreset)];
  const delay = delayOf(server.networkConfig?.latency);
  const rate = Math.round((server.networkConfig?.errorRate ?? 0) * 100);
  const active = rate > 0 || delay !== null;
  const parts = [
    rate ? `${rate}% of responses faulted` : "",
    delay ? `${delayLabel(delay.base)} ± ${delayLabel(delay.jitter)} delay` : "",
  ];
  return {
    title: delay ? `${look.label} · +${delayLabel(delay.base)}` : look.label,
    sub: active
      ? parts.filter(Boolean).join(" · ")
      : "Handlers respond normally with no added delay",
    active,
  };
}

/**
 * The network condition the mock serves under — its chaos and its added
 * delay, drawn in the chaos mode's colour, with a Stop for both — and four
 * live figures with their sparklines.
 *
 * @param props - The mock server, and its live figures
 * @returns The hero
 * @example
 * ```tsx
 * <NetworkHero server={server} figures={networkLive(logs, now, 500)} />
 * ```
 */
export function NetworkHero({
  server,
  figures,
}: {
  server: MockServerInfo;
  figures: readonly LiveFigure[];
}): React.ReactNode {
  const look = CHAOS_LOOK[chaosModeOf(server.chaosPreset)];
  const { title, sub, active } = conditionOf(server);
  return (
    <section
      aria-label="Network condition"
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] overflow-hidden rounded-[16px] border bg-panel",
        look.tone,
        active ? "border-[color-mix(in_srgb,currentColor_30%,transparent)]" : "border-line",
      )}
    >
      <div
        className={cn(
          "-mb-px flex items-center gap-3.5 border-r border-b border-line px-5 py-4.5",
          active && "bg-[color-mix(in_srgb,currentColor_6%,transparent)]",
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-dialog bg-[color-mix(in_srgb,currentColor_16%,transparent)]">
          <look.icon aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.75">
          <span className="text-label text-fg-subtle">Network condition</span>
          <span className="text-stat font-semibold tracking-[-0.02em] text-fg">{title}</span>
          <span className="truncate text-small text-fg-muted">{sub}</span>
        </div>
        {active && (
          <button
            type="button"
            onClick={() => stopAllFaults(server.serverId)}
            title="Stop all faults"
            className="flex h-7.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-card border border-err/40 bg-panel px-2.75 text-small font-semibold whitespace-nowrap text-err hover:bg-err-dim"
          >
            <OctagonX aria-hidden="true" className="size-3.25" />
            Stop
          </button>
        )}
      </div>
      <div className="grid grid-cols-4">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="flex min-w-0 flex-col justify-center gap-1.5 border-r border-line px-4 py-3.5 last:border-r-0"
          >
            <span className="text-badge whitespace-nowrap text-fg-subtle">{figure.label}</span>
            <span
              className={cn(
                "font-mono text-stat leading-none font-medium tracking-[-0.03em]",
                VALUE[figure.tone],
              )}
            >
              {figure.value}
            </span>
            <div aria-hidden="true" className="flex h-4 items-end gap-[1.5px]">
              {figure.spark.map((bar, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: a sparkline's bars are fixed positions in time
                  key={i}
                  className={cn("min-h-px flex-1 rounded-[1px]", SPARK[bar.tone])}
                  style={{ height: `${bar.height * 100}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
