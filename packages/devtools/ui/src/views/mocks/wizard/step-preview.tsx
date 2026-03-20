import { FileCode } from "lucide-react";
import { useState } from "react";
import { CodeBlock } from "@/components/shared/code-block";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import type { UseMockGeneratorReturn } from "./use-mock-generator";

interface PreviewStepProps {
  wizard: UseMockGeneratorReturn;
}

export function PreviewStep({ wizard }: PreviewStepProps): React.ReactElement {
  const { generatedFiles } = wizard.state;
  const [expandedPath, setExpandedPath] = useState<string | null>(
    generatedFiles[0]?.path ?? null,
  );

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-h3">Preview Generated Files</h3>
        <p className="text-body-sm text-muted-foreground">
          {generatedFiles.length} file{generatedFiles.length !== 1 ? "s" : ""} will be created.
          Review the output before writing to disk.
        </p>
      </div>

      <div className="space-y-1.5">
        {generatedFiles.map((file) => {
          const lineCount = file.content.split("\n").length;
          const isOpen = expandedPath === file.path;

          return (
            <Collapsible
              key={file.path}
              open={isOpen}
              onOpenChange={(open) => setExpandedPath(open ? file.path : null)}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 hover:bg-muted/30 transition-colors">
                <FileCode className="size-3.5 shrink-0 text-indigo-400" />
                <span className="flex-1 truncate text-left font-mono text-xs">{file.path}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {lineCount} line{lineCount !== 1 ? "s" : ""}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-5 mt-1">
                  <CodeBlock code={file.content} language={extFromPath(file.path)} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

function extFromPath(path: string): string {
  const ext = path.split(".").pop() ?? "";
  return ext === "tsx" || ext === "ts" ? "ts" : ext;
}
