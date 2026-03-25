/** Inline meta chips for response body — rendered inside JsonTree headerExtra */
export function BodyMeta({ data }: { data: unknown }): React.ReactElement | null {
  const chips = describeData(data);
  if (chips.length === 0) return null;

  return (
    <>
      {chips.map((chip) => (
        <span key={chip} className="rounded bg-card/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/50">
          {chip}
        </span>
      ))}
    </>
  );
}

function describeData(data: unknown): string[] {
  if (data === null || data === undefined) return [];
  const chips: string[] = [];

  if (Array.isArray(data)) {
    chips.push(`Array[${data.length}]`);
  } else if (typeof data === "object") {
    chips.push(`Object{${Object.keys(data as object).length}}`);
  } else {
    chips.push(typeof data);
  }

  const size = estimateSize(data);
  if (size) chips.push(size);

  return chips;
}

function estimateSize(data: unknown): string | null {
  try {
    const bytes = new Blob([JSON.stringify(data)]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  } catch {
    return null;
  }
}
