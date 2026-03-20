import { useState } from "react";
import { Save, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";

import type { useSessionHistory } from "./use-session-history";
import { SessionCard } from "./session-card";

// ── Session history section ──────────────────────────────────────────────────

interface SessionHistorySectionProps {
  history: ReturnType<typeof useSessionHistory>;
}

export function SessionHistorySection({
  history,
}: SessionHistorySectionProps): React.ReactElement {
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");

  function handleSave(): void {
    if (!name.trim()) return;
    history.saveCurrentSession(name.trim());
    setName("");
    setSaveOpen(false);
  }

  if (history.loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-body-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading sessions...
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-body-xs text-muted-foreground">
          {history.sessions.length} saved session{history.sessions.length !== 1 && "s"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSaveOpen(true)}
        >
          <Save className="mr-1.5 size-3.5" />
          Save current
        </Button>
      </div>

      {history.sessions.length === 0 ? (
        <EmptyState
          icon={Save}
          heading="No saved sessions"
          description="Save the current session to revisit it later."
          className="py-6"
        />
      ) : (
        <div className="space-y-2">
          {history.sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onLoad={history.loadSession}
              onDelete={history.deleteSession}
              onExport={history.exportSession}
            />
          ))}
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save session</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="session-name">Session name</Label>
            <Input
              id="session-name"
              placeholder="e.g. Debugging auth flow"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
