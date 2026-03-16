import { cn } from "@/lib/utils";
import { Braces, FileOutput } from "lucide-react";

interface SchemaIndicatorsProps {
  hasVariables: boolean;
  hasResponse: boolean;
}

/** Small icons showing variables/response schema presence */
export function SchemaIndicators({
  hasVariables,
  hasResponse,
}: SchemaIndicatorsProps): React.ReactElement | null {
  if (!hasVariables && !hasResponse) return null;

  return (
    <div className="flex items-center gap-1 shrink-0">
      {hasVariables && (
        <span title="Variables schema">
          <Braces className={cn("size-3", "text-sky-400/60")} />
        </span>
      )}
      {hasResponse && (
        <span title="Response schema">
          <FileOutput className={cn("size-3", "text-emerald-400/60")} />
        </span>
      )}
    </div>
  );
}
