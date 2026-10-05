import { Radar } from "lucide-react";

import type { FaultCount, LatencyBin, StripCell } from "@/features/mocks/observed-model";
import { cn } from "@/lib/utils";
import { NetworkCard } from "./network-card";

const BIN = { brand: "bg-brand", warn: "bg-warn", err: "bg-err" } as const;
const CELL = { ok: "bg-ok/70", warn: "bg-warn", err: "bg-err", empty: "bg-raised" } as const;
const FAULT = {
  "500": "bg-err",
  "503": "bg-[color-mix(in_srgb,var(--color-err)_55%,var(--color-warn))]",
  timeout: "bg-warn",
  reset: "bg-fg-subtle",
} as const;
const LEGEND = [
  ["2xx", "bg-ok"],
  ["4xx", "bg-warn"],
  ["5xx · reset", "bg-err"],
] as const;

interface ObservedPanelProps {
  bins: readonly LatencyBin[];
  strip: readonly StripCell[];
  faults: readonly FaultCount[];
  /** Opens the request a status cell stands for. */
  onOpen: (id: string) => void;
}

/**
 * What the mock's latest sixty answers looked like: how long they took,
 * their statuses in order — each opening its request's sheet — and the
 * faults chaos injected among them.
 *
 * @param props - The latency histogram, the status strip, the injected faults by kind, and what opens a request
 * @returns The panel
 * @example
 * ```tsx
 * <ObservedPanel bins={latencyHistogram(logs, 500)} strip={statusStrip(logs)} faults={faultsByType(logs)} onOpen={open} />
 * ```
 */
export function ObservedPanel({
  bins,
  strip,
  faults,
  onOpen,
}: ObservedPanelProps): React.ReactNode {
  return (
    <NetworkCard icon={Radar} tone="text-brand" title="Observed" note="last 60 responses">
      <div className="flex flex-col gap-4.5 p-4.5">
        <div className="flex flex-col gap-2">
          <span className="text-small text-fg-subtle">Latency distribution</span>
          <div className="flex h-30 items-end gap-1.25 rounded-panel bg-[repeating-linear-gradient(0deg,var(--color-line)_0_1px,transparent_1px_30px)] px-2 pt-2">
            {bins.map((bin) => (
              <span
                key={bin.label}
                title={`${bin.label} · ${bin.count}`}
                className={cn(
                  "min-h-0.5 flex-1 rounded-t-[4px] rounded-b-[1px] transition-[height] duration-300",
                  BIN[bin.tone],
                )}
                style={{ height: `${bin.share * 100}%` }}
              />
            ))}
          </div>
          <div aria-hidden="true" className="flex gap-1.25 px-2">
            {bins.map((bin) => (
              <span
                key={bin.label}
                className="flex-1 text-center font-mono text-micro text-fg-subtle"
              >
                {bin.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-small text-fg-subtle">Status timeline</span>
            <span className="flex gap-2.5 text-badge text-fg-subtle">
              {LEGEND.map(([label, fill]) => (
                <span key={label} className="flex items-center gap-1">
                  <span className={cn("size-1.75 rounded-[2px]", fill)} />
                  {label}
                </span>
              ))}
            </span>
          </div>
          <div className="flex h-7 gap-0.5">
            {strip.map((cell, i) =>
              cell.id === undefined ? (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: a cell is a fixed slot among the latest sixty answers
                  key={i}
                  className={cn("flex-1 rounded-[2px]", CELL[cell.tone])}
                />
              ) : (
                <button
                  type="button"
                  key={cell.id}
                  title={cell.tip}
                  aria-label={`Open ${cell.tip}`}
                  onClick={() => onOpen(cell.id ?? "")}
                  className={cn(
                    "flex-1 cursor-pointer rounded-[2px] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-brand",
                    CELL[cell.tone],
                  )}
                />
              ),
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-small text-fg-subtle">Injected faults by type</span>
          <div className="grid grid-cols-4 gap-px overflow-hidden rounded-panel border border-line bg-line">
            {faults.map((fault) => (
              <div key={fault.kind} className="flex flex-col gap-1 bg-inset px-3 py-2.5">
                <span className="flex items-center gap-1.5 font-mono text-badge text-fg-subtle">
                  <span className={cn("size-1.5 rounded-[2px]", FAULT[fault.kind])} />
                  {fault.kind}
                </span>
                <span className="font-mono text-figure font-medium">{fault.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </NetworkCard>
  );
}
