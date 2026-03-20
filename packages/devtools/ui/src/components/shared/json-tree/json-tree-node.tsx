import { useState, useCallback } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { JsonTreePrimitive } from "./json-tree-primitive";

interface JsonTreeNodeProps {
  name: string;
  value: unknown;
  depth: number;
  defaultExpanded?: boolean;
  onSelect?: (path: string[]) => void;
  path: string[];
}

export function JsonTreeNode({
  name,
  value,
  depth,
  defaultExpanded = false,
  onSelect,
  path,
}: JsonTreeNodeProps): React.ReactElement {
  const isExpandable = isObject(value) || isArray(value);
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 1);

  const toggle = useCallback(() => {
    if (isExpandable) setExpanded((prev) => !prev);
  }, [isExpandable]);

  const handleClick = useCallback(() => {
    toggle();
    onSelect?.(path);
  }, [toggle, onSelect, path]);

  return (
    <div className="select-text">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1 rounded px-1 py-px text-left",
          "hover:bg-accent/50 transition-colors duration-100",
          isExpandable && "cursor-pointer",
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleClick}
      >
        {isExpandable ? (
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-90",
            )}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <span className="mono-sm text-violet-400">{name}</span>
        <span className="mono-sm text-muted-foreground/50">:</span>

        {!isExpandable && (
          <JsonTreePrimitive value={value} />
        )}

        {isExpandable && !expanded && (
          <CollapsedPreview value={value} />
        )}
      </button>

      {isExpandable && expanded && (
        <ExpandedChildren
          value={value}
          depth={depth}
          onSelect={onSelect}
          path={path}
        />
      )}
    </div>
  );
}

function CollapsedPreview({ value }: { value: unknown }): React.ReactElement {
  if (isArray(value)) {
    return (
      <span className="mono-xs text-muted-foreground">
        [{(value as unknown[]).length}]
      </span>
    );
  }
  const keys = Object.keys(value as object);
  return (
    <span className="mono-xs text-muted-foreground">
      {`{${keys.length}}`}
    </span>
  );
}

function ExpandedChildren({
  value,
  depth,
  onSelect,
  path,
}: {
  value: unknown;
  depth: number;
  onSelect?: (path: string[]) => void;
  path: string[];
}): React.ReactElement {
  const entries = isArray(value)
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as object);

  return (
    <>
      {entries.map(([key, val]) => (
        <JsonTreeNode
          key={key}
          name={key}
          value={val}
          depth={depth + 1}
          onSelect={onSelect}
          path={[...path, key]}
        />
      ))}
    </>
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
