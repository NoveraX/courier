import { ChevronRight } from "lucide-react";
import { CopyButton } from "@/components/shared/copy-button";
import { cn } from "@/lib/utils";

interface PathBreadcrumbProps {
  path: string[];
  className?: string;
}

export function PathBreadcrumb({ path, className }: PathBreadcrumbProps): React.ReactElement {
  if (path.length === 0) return <></>;

  const fullPath = path
    .map((segment) => (/^\d+$/.test(segment) ? `[${segment}]` : segment))
    .join(".")
    .replace(/\.\[/g, "[");

  return (
    <div className={cn("flex items-center gap-0.5 mono-xs text-muted-foreground", className)}>
      <span className="text-foreground-secondary">root</span>
      {path.map((segment, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the segments of one path, in order; a segment's place is its identity
        <span key={i} className="flex items-center gap-0.5">
          <ChevronRight className="size-3 opacity-40" />
          <span className="text-foreground-secondary">{segment}</span>
        </span>
      ))}
      <CopyButton value={fullPath} label="Copy path" className="ml-1" />
    </div>
  );
}
