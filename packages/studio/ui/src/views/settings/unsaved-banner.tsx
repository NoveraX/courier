import { Save, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";

// ── Unsaved changes banner ───────────────────────────────────────────────────

interface UnsavedBannerProps {
  onSave: () => void;
  onDiscard: () => void;
}

export function UnsavedBanner({ onSave, onDiscard }: UnsavedBannerProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-b border-warning/30 bg-warning/5 px-4 py-2">
      <p className="text-body-sm text-warning">You have unsaved changes</p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          <Undo2 className="mr-1.5 size-3.5" />
          Discard
        </Button>
        <Button size="sm" onClick={onSave}>
          <Save className="mr-1.5 size-3.5" />
          Save
        </Button>
      </div>
    </div>
  );
}
