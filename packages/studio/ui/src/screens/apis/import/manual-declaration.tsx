import { CodeLines } from "@/design/code/code-lines";
import { leftOutNote } from "@/features/apis/left-out-note";
import type { ImportDeclaration } from "@/features/apis/types";

function Part({ label, code }: { label: string; code: string }): React.ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-small text-fg-subtle">{label}</p>
      <div className="overflow-auto rounded-[11px] border border-line bg-inset">
        <CodeLines code={code} variant="panel" />
      </div>
    </div>
  );
}

/**
 * The lines that declare an import in the config, to add by hand: the
 * import of the generated source and its `sources` entry — in the module
 * the config takes its `sources` from, when it does — and the import's own
 * entry under `imports`, which Manage and the update check read.
 *
 * @param props - What the config must still declare
 * @returns The lines, each under what to do with it
 * @example
 * ```tsx
 * <ManualDeclaration declaration={declaration} />
 * ```
 */
export function ManualDeclaration({
  declaration,
}: {
  declaration: ImportDeclaration;
}): React.ReactNode {
  const { configFile, sourcesFile, source, importEntry, leftOut } = declaration;
  return (
    <div className="flex flex-col gap-3.5">
      {source && (
        <>
          <Part
            label={
              sourcesFile
                ? `In ${sourcesFile}, which the config takes its sources from, import the generated source at the top of the file:`
                : "Import the generated source at the top of the file:"
            }
            code={source.importLine}
          />
          <Part
            label={
              sourcesFile ? `Add it to the sources ${sourcesFile} exports:` : "Add it to sources:"
            }
            code={source.entry}
          />
        </>
      )}
      {importEntry && (
        <>
          <Part
            label={`${sourcesFile ? `In ${configFile}, declare` : "Declare"} the import under imports — Studio checks and manages an import only from its declaration, and generates the endpoints you add with the options written there:`}
            code={importEntry}
          />
          {leftOut > 0 && <p className="m-0 text-small text-fg-muted">{leftOutNote(leftOut)}</p>}
        </>
      )}
    </div>
  );
}
