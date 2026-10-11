import { ArrowUpRight, FileCode } from "lucide-react";

import { Skeleton } from "@/design/skeleton";
import type { CallSite } from "@/features/editor/call-sites";
import { askEditorHost, insideEditor } from "@/features/editor/editor-host";
import { editorLink } from "@/features/editor/editor-link";
import { useCallSites } from "@/features/editor/use-call-sites";
import { useStudioStore } from "@/store";

const SHOWN = 8;

/**
 * Where the project's code calls an endpoint, each call site opening in the
 * editor Settings names — or, when Studio shows inside an editor's own tab,
 * in that editor. Nothing shows on a public demo, which reads no project's
 * code for its visitors.
 *
 * @param props - The endpoint's source and its call in the client
 * @returns The section, or nothing
 * @example
 * ```tsx
 * <CalledFrom source="shop" endpoint="orders.place" />
 * ```
 */
export function CalledFrom({
  source,
  endpoint,
}: {
  source: string;
  endpoint: string;
}): React.ReactNode {
  const found = useCallSites(source, endpoint);
  const chosen = useStudioStore((s) => s.settings.codeEditor);
  const hosted = insideEditor();
  const editor = hosted ? "host" : chosen;
  if (found.status === "unavailable") return null;
  return (
    <section className="flex flex-col">
      <h3 className="m-0 pb-2 text-label font-semibold text-fg-muted">Called from</h3>
      {found.status === "loading" && <Skeleton className="h-11 w-full rounded-panel" />}
      {found.status === "failed" && (
        <p className="m-0 text-small text-fg-subtle">{found.message}</p>
      )}
      {found.status === "ready" && found.sites.length === 0 && (
        <p className="m-0 text-small leading-[1.5] text-fg-subtle">
          No call in the project's code names this endpoint: it was called from the Playground,
          another app, or code Studio does not read.
        </p>
      )}
      {found.status === "ready" && found.sites.length > 0 && (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-panel border border-line p-0">
          {found.sites.slice(0, SHOWN).map((site) => (
            <SiteRow
              key={`${site.file}:${site.line}:${site.column}`}
              site={site}
              link={hosted ? "#" : editorLink(chosen, site.path, site.line, site.column)}
              hosted={hosted}
            />
          ))}
        </ul>
      )}
      {found.status === "ready" && found.sites.length > SHOWN && (
        <p className="m-0 pt-1.5 text-label text-fg-subtle">
          and {found.sites.length - SHOWN} more
        </p>
      )}
      {found.status === "ready" && found.sites.length > 0 && editor === "off" && (
        <p className="m-0 pt-1.5 text-label text-fg-subtle">
          Choose an editor in Settings → Editor to open these.
        </p>
      )}
    </section>
  );
}

function SiteRow({
  site,
  link,
  hosted,
}: {
  site: CallSite;
  link: string | undefined;
  hosted: boolean;
}): React.ReactNode {
  const place = `${site.file}:${site.line}`;
  const openInHost = (event: React.MouseEvent) => {
    event.preventDefault();
    askEditorHost({ source: "courier-studio", type: "open-file", ...siteAt(site) });
  };
  const body = (
    <>
      <FileCode aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-fg-subtle" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-mono text-small text-fg">{place}</span>
        <span className="truncate font-mono text-label text-fg-subtle">{site.code}</span>
      </span>
      {link && (
        <ArrowUpRight aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-fg-subtle" />
      )}
    </>
  );
  const row = "flex items-start gap-2.5 px-3 py-2.25";
  return (
    <li className="border-b border-line last:border-b-0">
      {link ? (
        <a
          href={link}
          title={`Open ${place} in your editor`}
          onClick={hosted ? openInHost : undefined}
          className={`${row} no-underline transition-colors hover:bg-raised`}
        >
          {body}
        </a>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}

function siteAt(site: CallSite): { path: string; line: number; column: number } {
  return { path: site.path, line: site.line, column: site.column };
}
