import { Radio, Wifi } from "lucide-react";

interface TransportBadgeProps {
  transport: "sse" | "ws";
}

export function TransportBadge({ transport }: TransportBadgeProps): React.ReactElement {
  const Icon = transport === "ws" ? Wifi : Radio;
  const label = transport === "sse" ? "SSE" : "WS";
  const color =
    transport === "sse" ? "text-emerald-400 bg-emerald-500/10" : "text-sky-400 bg-sky-500/10";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-caption font-medium ${color}`}
    >
      <Icon className="size-2.5" />
      {label}
    </span>
  );
}
