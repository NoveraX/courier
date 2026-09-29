import { useCallback, useState } from "react";
import { CopyButton } from "@/components/shared/copy-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { safeStringify } from "@/lib/snippets";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { JsonTreeNode } from "./json-tree-node";
import { PathBreadcrumb } from "./path-breadcrumb";

interface JsonTreeProps {
  data: unknown;
  className?: string;
  maxHeight?: string;
  /** Fill all available parent height (parent must be flex column) */
  fill?: boolean;
  showPath?: boolean;
  showCopy?: boolean;
  /** Extra content rendered in the header bar (left side, before copy) */
  headerExtra?: React.ReactNode;
}

export function JsonTree({
  data,
  className,
  maxHeight = "400px",
  fill = false,
  showPath = true,
  showCopy = true,
  headerExtra,
}: JsonTreeProps): React.ReactElement {
  const jsonIndent = useStudioStore((s) => s.settings.jsonIndent);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

  const handleSelect = useCallback((path: string[]) => {
    setSelectedPath(path);
  }, []);

  const serialized = safeStringify(data, jsonIndent);
  const isExpandable = isComplex(data);
  const scrollStyle = !fill && maxHeight !== "none" ? { maxHeight } : undefined;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border-subtle bg-background-inset",
        fill && "flex min-h-0 flex-1 flex-col",
        className,
      )}
    >
      {(showPath || showCopy || headerExtra) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1.5">
          {showPath && <PathBreadcrumb path={selectedPath} />}
          {headerExtra}
          <div className="flex-1" />
          {showCopy && <CopyButton value={serialized} label="Copy JSON" />}
        </div>
      )}

      <ScrollArea style={scrollStyle} className={cn("p-2", fill && "min-h-0 flex-1")}>
        {isExpandable ? (
          <RootEntries data={data} onSelect={handleSelect} />
        ) : (
          <pre className="mono-sm px-1 py-0.5">{serialized}</pre>
        )}
      </ScrollArea>
    </div>
  );
}

function RootEntries({
  data,
  onSelect,
}: {
  data: unknown;
  onSelect: (path: string[]) => void;
}): React.ReactElement {
  const entries: ReadonlyArray<readonly [string, unknown]> = Array.isArray(data)
    ? data.map((v, i) => [String(i), v] as const)
    : typeof data === "object" && data !== null
      ? Object.entries(data)
      : [];

  return (
    <>
      {entries.map(([key, val]) => (
        <JsonTreeNode key={key} name={key} value={val} depth={0} onSelect={onSelect} path={[key]} />
      ))}
    </>
  );
}

function isComplex(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

export { JsonTreeNode } from "./json-tree-node";
export { JsonTreePrimitive } from "./json-tree-primitive";
export { PathBreadcrumb } from "./path-breadcrumb";
