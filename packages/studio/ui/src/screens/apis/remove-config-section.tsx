import { AlertTriangle } from "lucide-react";

import type { RemovalConfigNotes } from "@/apis/client-file-changes";
import type { UseRemoveImportReturn } from "@/apis/use-remove-import";
import { ChangePreview } from "@/design/code/change-preview";
import { TickBox } from "@/design/tick-box";

function ConfigNotes({
  name,
  notes,
  reason,
}: {
  name: string;
  notes: RemovalConfigNotes;
  reason?: string | undefined;
}): React.ReactNode {
  const config = notes.configFile ?? "courier.config";
  if (notes.configImports.length === 0 && !notes.importDeclared) return null;
  return (
    <section aria-label={config} className="flex flex-col gap-2 rounded-panel bg-warn-dim p-3">
      <h4 className="m-0 flex items-center gap-1.5 text-small font-strong text-warn">
        <AlertTriangle aria-hidden="true" className="size-3.25" />
        Studio leaves {config} as it is
      </h4>
      {reason && <p className="m-0 text-small text-fg-muted">{reason}</p>}
      {notes.configImports.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-small text-fg-muted">
            {config} imports these files. Once they are gone it stops loading, until you remove
            those imports too:
          </p>
          {notes.configImports.map((path) => (
            <span key={path} className="font-mono text-small">
              {path}
            </span>
          ))}
        </div>
      )}
      {notes.importDeclared && (
        <p className="m-0 text-small text-fg-muted">
          It still declares <span className="font-mono text-fg">imports.{name}</span>: remove that
          entry too, or Studio goes on checking the import for updates.
        </p>
      )}
    </section>
  );
}

/**
 * What removing an import does to courier.config: the lines Studio takes
 * out of it before the files go, with a box to leave the config as it is —
 * or, when Studio leaves the config to the developer, why, and what to
 * remove by hand.
 *
 * @param props - The removal from `useRemoveImport`
 * @returns The section; nothing while the config declares nothing of the import
 * @example
 * ```tsx
 * <RemoveConfigSection removal={removal} />
 * ```
 */
export function RemoveConfigSection({
  removal,
}: {
  removal: UseRemoveImportReturn;
}): React.ReactNode {
  const { name, notes, change, undeclare } = removal;
  if (name === null || notes === null) return null;
  if (change?.status !== "ready") {
    return <ConfigNotes name={name} notes={notes} reason={change?.reason} />;
  }
  const label = `Also remove ${name} from ${change.configFile}`;
  return (
    <section aria-label={`Changes to ${change.configFile}`} className="flex flex-col gap-2.5">
      <label className="flex cursor-pointer items-start gap-2">
        <span className="pt-0.5">
          <TickBox
            checked={undeclare}
            label={label}
            onChange={() => removal.setUndeclare(!undeclare)}
          />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-small font-strong">{label}</span>
          <span className="text-small text-fg-subtle">
            Studio removes these lines first and loads the config without them, then removes the
            files. It changes nothing else in the file.
          </span>
        </span>
      </label>
      {undeclare ? (
        <ChangePreview target={change.configFile} hunks={change.hunks} />
      ) : (
        <ConfigNotes name={name} notes={notes} />
      )}
    </section>
  );
}
