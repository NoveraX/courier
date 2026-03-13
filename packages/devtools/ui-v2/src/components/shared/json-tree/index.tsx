import { useState, useCallback } from "react";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CopyButton } from "@/components/shared/copy-button";
import { JsonTreeNode } from "./json-tree-node";
import { PathBreadcrumb } from "./path-breadcrumb";

interface JsonTreeProps {
  data: unknown;
  className?: string;
  maxHeight?: string;
  showPath?: boolean;
  showCopy?: boolean;
}

export function JsonTree({
  data,
  className,
  maxHeight = "400px",
  showPath = true,
  showCopy = true,
}: JsonTreeProps): React.ReactElement {
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

  const handleSelect = useCallback((path: string[]) => {
    setSelectedPath(path);
  }, []);

  const serialized = safeStringify(data);
  const isExpandable = isComplex(data);

  return (
    <div className={cn("rounded-lg border border-border-subtle bg-background-inset", className)}>
      {(showPath || showCopy) && (
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5">
          {showPath && <PathBreadcrumb path={selectedPath} />}
          {!showPath && <div />}
          {showCopy && <CopyButton value={serialized} label="Copy JSON" />}
        </div>
      )}

      <ScrollArea style={{ maxHeight }} className="p-2">
        {isExpandable ? (
          <RootEntries
            data={data}
            onSelect={handleSelect}
          />
        ) : (
          <pre className="text-mono-sm px-1 py-0.5">{serialized}</pre>
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
  const entries = Array.isArray(data)
    ? (data as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(data as object);

  return (
    <>
      {entries.map(([key, val]) => (
        <JsonTreeNode
          key={key}
          name={key}
          value={val}
          depth={0}
          onSelect={onSelect}
          path={[key]}
        />
      ))}
    </>
  );
}

function isComplex(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export { PathBreadcrumb } from "./path-breadcrumb";
export { JsonTreeNode } from "./json-tree-node";
export { JsonTreePrimitive } from "./json-tree-primitive";
