import { FileCode, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/shared/code-block";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import type { GeneratedFile } from "./types";

interface PreviewStepProps {
  files: GeneratedFile[];
  sourceName: string;
  error: string | null;
}

export function PreviewStepView({
  files,
  sourceName,
  error,
}: PreviewStepProps): React.ReactElement {
  const [expandedFile, setExpandedFile] = useState<string | null>(
    files[0]?.path ?? null,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-h3 text-foreground">Preview Generated Code</h3>
        <p className="text-body-sm text-muted-foreground">
          {files.length} files will be created for <span className="font-mono text-foreground">{sourceName}</span>
        </p>
      </div>

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
                <ChevronRight className={cn(
                  "size-3 text-muted-foreground transition-transform",
                  isExpanded && "rotate-90",
                )} />
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

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
