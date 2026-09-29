import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useElapsed } from "@/hooks/use-tick";
import { getSocket } from "@/socket";

interface ActiveBannerProps {
  scenarioName: string;
  activeSince: number;
  requestsServed: number;
  serverId: string;
}

export function ActiveBanner({
  scenarioName,
  activeSince,
  requestsServed,
  serverId,
}: ActiveBannerProps): React.ReactElement {
  const elapsed = useElapsed(activeSince) ?? "0s";

  const handleDeactivate = () => {
    getSocket().emit("mock:command", {
      action: "mock:scenario:apply",
      serverId,
      scenario: "happy-path",
    });
  };

  return (
    <div className="relative flex h-8 w-full shrink-0 items-center gap-3 border-b border-border-subtle/60 bg-emerald-500/[0.03] px-3">
      {/* Colored top accent line — the only "active" indicator needed */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0" />

      {/* Pulse dot */}
      <span className="relative flex size-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>

      {/* Label */}
      <span className="text-caption font-medium uppercase tracking-widest text-emerald-600/60 dark:text-emerald-400/50">
        Active
      </span>

      <div className="h-2.5 w-px shrink-0 bg-border-subtle" />

      {/* Scenario name — primary info */}
      <span className="text-body-xs font-semibold text-foreground/90 truncate">{scenarioName}</span>

      {/* Stats group */}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-caption tabular-nums text-muted-foreground/50">
          {requestsServed} req
        </span>
        <div className="h-2.5 w-px shrink-0 bg-border-subtle" />
        <span className="text-caption tabular-nums text-muted-foreground/40">{elapsed}</span>
      </div>

      <div className="h-2.5 w-px shrink-0 bg-border-subtle" />

      <Button
        variant="ghost"
        size="xs"
        className="h-5 gap-1.5 px-2 text-caption text-muted-foreground/50 hover:bg-rose-500/8 hover:text-rose-500"
        onClick={handleDeactivate}
      >
        <RotateCcw className="size-2.5" />
        Deactivate
      </Button>
    </div>
  );
}
