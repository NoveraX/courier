import { ChevronRight, FileCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CodeBlock } from "@/components/shared/code-block";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { FilePlanView } from "./file-plan-view";
import type { GeneratedFile } from "./types";
import type { PlanConsent } from "./types-file-plan";

interface PreviewStepProps {
  files: GeneratedFile[];
  sourceName: string;
  error: string | null;
  /** The plan Studio would not apply unasked, and the steps allowed so far. */
  consent: PlanConsent | null;
  onToggleConfirmed: (path: string) => void;
}

/**
 * The generated code, file by file, before it is written. Once Studio has
 * refused to write unasked, the plan it sent comes first: what each file
 * would become, and the steps the user allows before writing again.
 *
 * A refusal is said above the files and brought into view: an expanded
 * file is long enough to push anything below it out of the scrolled step,
 * where a refused Write to Disk would look like one that did nothing.
 */
export function PreviewStepView({
  files,
  sourceName,
  error,
  consent,
  onToggleConfirmed,
}: PreviewStepProps): React.ReactElement {
  const [expandedFile, setExpandedFile] = useState<string | null>(files[0]?.path ?? null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) alertRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-h3 text-foreground">Preview Generated Code</h3>
        <p className="text-body-sm text-muted-foreground">
          Studio generates {files.length} files for{" "}
          <span className="font-mono text-foreground">{sourceName}</span>
        </p>
      </div>

      {error && !consent && (
        <p ref={alertRef} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {consent && (
        <div className="space-y-3 rounded-md border border-border-subtle p-3">
          {error && (
            <p ref={alertRef} role="alert" className="text-body-sm text-foreground">
              {error}
            </p>
          )}
          <FilePlanView
            plan={consent.plan}
            confirmed={consent.confirmed}
            onToggle={onToggleConfirmed}
          />
        </div>
      )}

      <div className="space-y-1.5">
        {files.map((file) => {
          const isExpanded = expandedFile === file.path;
          const ext = file.path.split(".").pop() ?? "ts";
          const lines = file.content.split("\n").length;

          return (
            <Collapsible
              key={file.path}
              open={isExpanded}
              onOpenChange={(open) => setExpandedFile(open ? file.path : null)}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 hover:bg-muted/30 transition-colors">
                <ChevronRight
                  className={cn(
                    "size-3 text-muted-foreground transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
                <FileCode className="size-3.5 text-indigo-400 shrink-0" />
                <span className="text-xs font-mono text-foreground truncate">{file.path}</span>
                <Badge variant="secondary" className="ml-auto text-[10px] shrink-0">
                  {lines} lines
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 ml-5">
                  <CodeBlock code={file.content} language={ext} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
