import { Ban } from "lucide-react";

import type { FilePlanSummary } from "@/features/apis/types-file-plan";

/** Files Studio cannot write at all; nothing is applied until they are dealt with. */
export function FilePlanBlocked({
  blocked,
}: {
  blocked: FilePlanSummary["blocked"];
}): React.ReactElement | null {
  if (blocked.length === 0) return null;
  return (
    <section
      className="space-y-1.5 rounded-md border border-rose-500/30 bg-rose-500/5 p-3"
      aria-label="Files Studio cannot write"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-rose-400">
        <Ban className="size-3" />
        Studio cannot write these files
      </h4>
      <p className="text-body-sm text-muted-foreground">
        Each is a link or not a file. Move it out of the way, then try again; nothing was written.
      </p>
      <ul className="space-y-0.5">
        {blocked.map(({ path, reason }) => (
          <li key={path} className="mono-sm truncate text-foreground">
            {path}{" "}
            <span className="text-muted-foreground">
              ({reason === "link" ? "a link" : "not a file"})
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
