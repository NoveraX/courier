interface CountDisplayProps {
  filtered: number;
  total: number;
  label?: string;
}

export function CountDisplay({
  filtered,
  total,
  label = "items",
}: CountDisplayProps): React.ReactElement {
  return (
    <span className="shrink-0 text-caption tabular-nums text-muted-foreground/60">
      {filtered === total ? `${total} ${label}` : `${filtered} / ${total}`}
    </span>
  );
}
