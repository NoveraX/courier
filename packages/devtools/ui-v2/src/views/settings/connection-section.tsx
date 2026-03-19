import { Controller } from "react-hook-form";

import type { UseFormReturn } from "react-hook-form";
import type { Settings } from "@/store/types";

import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useDevToolsStore } from "@/store";
import { RECONNECT_DELAY_OPTIONS } from "./constants";
import { SettingRow } from "./setting-row";

// ── Connection section ───────────────────────────────────────────────────────

interface ConnectionSectionProps {
  form: UseFormReturn<Settings>;
}

export function ConnectionSection({
  form,
}: ConnectionSectionProps): React.ReactElement {
  const connected = useDevToolsStore((s) => s.connected);

  return (
    <>
      <SettingRow label="Status">
        <Badge variant={connected ? "success" : "destructive"}>
          {connected ? "Connected" : "Disconnected"}
        </Badge>
      </SettingRow>

      <SettingRow
        label="Auto-reconnect"
        description="Automatically reconnect when the connection drops"
        htmlFor="autoReconnect"
      >
        <Controller
          control={form.control}
          name="autoReconnect"
          render={({ field }) => (
            <Switch
              id="autoReconnect"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </SettingRow>

      <SettingRow
        label="Reconnect delay"
        description="Time to wait before attempting reconnection"
      >
        <Controller
          control={form.control}
          name="reconnectDelay"
          render={({ field }) => (
            <Select
              value={String(field.value)}
              onValueChange={(v) => field.onChange(Number(v))}
            >
              <SelectTrigger className="w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECONNECT_DELAY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </SettingRow>
    </>
  );
}
