import { cn } from "@/lib/utils";

interface PathDisplayProps {
  path: string;
  className?: string;
}

/** Renders a URL path with `:param` segments highlighted in accent color */
export function PathDisplay({ path, className }: PathDisplayProps): React.ReactElement {
  const segments = parsePath(path);

  return (
    <span className={cn("font-mono text-mono-sm", className)}>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={seg.isParam ? "text-accent-brand" : "text-muted-foreground"}
        >
          {seg.text}
        </span>
      ))}
    </span>
  );
}

// ── Path parser ─────────────────────────────────────────────────────────────

interface PathSegment {
  text: string;
  isParam: boolean;
}

function parsePath(path: string): PathSegment[] {
  const parts = path.split("/");
  const segments: PathSegment[] = [];

  for (const [i, part] of parts.entries()) {
    if (i > 0) segments.push({ text: "/", isParam: false });
    if (part.startsWith(":")) {
      segments.push({ text: part, isParam: true });
    } else {
      segments.push({ text: part, isParam: false });
    }
  }

  return segments;
}
