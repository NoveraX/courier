import { useEffect, useRef, useState } from "react";
import type { FieldType } from "@/features/mocks/data-table-utils";
import { formatValue, parseValue } from "@/features/mocks/data-table-utils";
import { buttonProps } from "@/lib/button-props";
import { cn } from "@/lib/utils";

interface EditableCellProps {
  value: unknown;
  type: FieldType;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}

export function EditableCell({
  value,
  type,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
}: EditableCellProps): React.ReactElement {
  if (isEditing) {
    return <CellInput value={value} type={type} onCommit={onCommit} onCancel={onCancel} />;
  }

  return (
    <div
      className="w-35 shrink-0 truncate px-2 text-body-sm cursor-text hover:bg-muted/30 rounded-sm transition-colors"
      {...buttonProps(onStartEdit, { doubleClick: true })}
    >
      <CellDisplay value={value} type={type} />
    </div>
  );
}

// ── Display ──────────────────────────────────────────────────────────────────

function CellDisplay({ value, type }: { value: unknown; type: FieldType }): React.ReactElement {
  if (value === null || value === undefined) {
    return <span className="text-xs italic text-muted-foreground/25">Null</span>;
  }
  if (type === "bool") {
    return (
      <span className={cn("text-xs font-medium", value ? "text-emerald-400" : "text-rose-400/60")}>
        {String(value)}
      </span>
    );
  }
  return <>{formatValue(value)}</>;
}

// ── Input ────────────────────────────────────────────────────────────────────

function CellInput({
  value,
  type,
  onCommit,
  onCancel,
}: {
  value: unknown;
  type: FieldType;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}): React.ReactElement {
  const isNull = value === null || value === undefined;
  const [draft, setDraft] = useState(isNull ? "" : formatValue(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    if (draft === "") {
      onCommit(null);
      return;
    }
    onCommit(parseValue(draft, type));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      commit();
    }
  };

  if (type === "bool") {
    return (
      <div className="flex w-35 shrink-0 items-center px-2">
        <button
          type="button"
          className={cn(
            "relative flex h-5 w-8 items-center rounded-full transition-colors",
            draft === "true" ? "bg-emerald-500/30" : "bg-muted/50",
          )}
          onClick={() => {
            onCommit(draft !== "true");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          // biome-ignore lint/a11y/noAutofocus: the cell becomes this control because it was just opened for editing
          autoFocus
        >
          <div
            className={cn(
              "ml-0.5 size-3.5 rounded-full bg-foreground/80 transition-transform",
              draft === "true" && "translate-x-3",
            )}
          />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-35 shrink-0 items-center px-1">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder="Null"
        className="h-7 w-full rounded border border-accent-brand/50 bg-background px-1.5 font-mono text-[11px] text-foreground outline-none ring-1 ring-accent-brand/20 placeholder:italic placeholder:text-muted-foreground/25"
      />
    </div>
  );
}
