import { Cable } from "lucide-react";

import { Segmented } from "@/design/segmented";
import { ToggleSwitch } from "@/design/toggle-switch";
import { cn } from "@/lib/utils";
import type { SettingsDraft } from "@/settings/use-settings-draft";
import { useStudioStore } from "@/store";
import { RECONNECT_DELAYS } from "../setting-options";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Settings → Connection: whether this page is connected to Studio and how
 * many runtimes Studio sees, and how it reconnects when the link drops.
 *
 * @param props - The draft
 * @returns The section
 * @example
 * ```tsx
 * <ConnectionSection settings={draft} />
 * ```
 */
export function ConnectionSection({ settings }: { settings: SettingsDraft }): React.ReactNode {
  const { draft, changed, set } = settings;
  const connected = useStudioStore((s) => s.connectionStatus === "connected");
  const runtimes = useStudioStore((s) => s.bindingSnapshot.runtimeCount);
  return (
    <SettingSection
      id="connection"
      label="Connection"
      description="This page's link to Studio, and how it reconnects"
      icon={Cable}
      tone="text-brand"
    >
      <SettingRow
        label="Status"
        description={`Studio at ${window.location.origin}`}
        control={
          <span
            className={cn(
              "flex h-7 items-center gap-2 rounded-full px-2.5 font-mono text-label font-medium",
              connected ? "bg-ok-dim text-ok" : "bg-err-dim text-err",
            )}
          >
            {connected ? `connected · ${plural(runtimes, "runtime")}` : "disconnected"}
          </span>
        }
      />
      <SettingRow
        label="Auto-reconnect"
        description="Reconnect by itself when the connection drops"
        edited={changed.has("autoReconnect")}
        control={
          <ToggleSwitch
            label="Auto-reconnect"
            size="lg"
            checked={draft.autoReconnect}
            onChange={(on) => set("autoReconnect", on)}
          />
        }
      />
      <SettingRow
        label="Reconnect delay"
        description="How long to wait before each attempt"
        edited={changed.has("reconnectDelay")}
        control={
          <Segmented
            label="Reconnect delay"
            options={RECONNECT_DELAYS}
            value={String(draft.reconnectDelay)}
            onChange={(v) => set("reconnectDelay", Number(v))}
          />
        }
      />
    </SettingSection>
  );
}
