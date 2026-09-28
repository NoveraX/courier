import { useState } from "react";
import { Trash2, RotateCcw, Database } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStudioStore } from "@/store";
import { useClearRequests } from "@/hooks/use-clear-requests";

import type { useSessionHistory } from "./use-session-history";
import { ConfirmDialog } from "./confirm-dialog";

// ── Danger zone ──────────────────────────────────────────────────────────────

interface DangerAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  getCount?: () => number;
}

interface DangerZoneProps {
  onResetDefaults: () => void;
  history: ReturnType<typeof useSessionHistory>;
}

export function DangerZone({
  onResetDefaults,
  history,
}: DangerZoneProps): React.ReactElement {
  const [confirm, setConfirm] = useState<string | null>(null);
  const requests = useStudioStore((s) => s.requests);
  const clearRequests = useClearRequests();

  const actions: DangerAction[] = [
    {
      id: "clear-requests",
      label: "Clear all requests",
      description: "Remove all captured requests from memory. This cannot be undone.",
      icon: Trash2,
      getCount: () => requests.length,
    },
    {
      id: "reset-settings",
      label: "Reset settings to defaults",
      description: "Restore all settings to their factory defaults.",
      icon: RotateCcw,
    },
    {
      id: "clear-sessions",
      label: "Clear session history",
      description: "Delete all saved sessions from disk. This cannot be undone.",
      icon: Database,
      getCount: () => history.sessions.length,
    },
  ];

  function handleConfirm(): void {
    if (confirm === "clear-requests") clearRequests();
    if (confirm === "reset-settings") onResetDefaults();
    if (confirm === "clear-sessions") history.deleteAllSessions();
    setConfirm(null);
  }

  const active = actions.find((a) => a.id === confirm);

  return (
    <>
      <div className="space-y-2">
        {actions.map((action) => {
          const count = action.getCount?.();
          return (
            <div
              key={action.id}
              className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <action.icon className="size-4 text-destructive" />
                <p className="text-body-sm font-medium text-foreground">
                  {action.label}
                  {count !== undefined && (
                    <span className="text-muted-foreground ml-1">({count})</span>
                  )}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirm(action.id)}
              >
                {action.label.split(" ")[0]}
              </Button>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={() => setConfirm(null)}
        title={active?.label ?? ""}
        description={active?.description ?? ""}
        onConfirm={handleConfirm}
        confirmLabel="Confirm"
      />
    </>
  );
}
