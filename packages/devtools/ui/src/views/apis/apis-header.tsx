import { Loader2, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ApisHeaderProps {
  sourceCount: number;
  scannedCount: number;
  checking: boolean;
  onImport: () => void;
  onCheckAll: () => void;
}

export function ApisHeader({
  sourceCount,
  scannedCount,
  checking,
  onImport,
  onCheckAll,
}: ApisHeaderProps): React.ReactElement {
  const total = sourceCount + scannedCount;

  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-subtle px-3">
      <div className="flex items-center gap-2">
        {total > 0 && (
          <span className="text-caption text-muted-foreground">
            {sourceCount} imported{scannedCount > 0 ? ` · ${scannedCount} scanned` : ""}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {sourceCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={checking}
                onClick={onCheckAll}
              >
                {checking ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Check updates
              </Button>
            </TooltipTrigger>
            <TooltipContent>Check all sources for spec changes</TooltipContent>
          </Tooltip>
        )}

        <Button
          size="sm"
          className="h-7 gap-1.5 bg-accent-brand px-3 text-xs font-medium text-white hover:bg-accent-brand/90"
          onClick={onImport}
        >
          <Plus className="size-3" />
          Import API
        </Button>
      </div>
    </div>
  );
}
