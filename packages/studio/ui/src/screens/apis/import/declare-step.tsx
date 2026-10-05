import { CheckCircle2 } from "lucide-react";

import { CodeLines } from "@/design/code/code-lines";
import type { ImportDeclaration } from "@/views/apis/types";

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

function leftOutNote(leftOut: number): string {
  const count = leftOut === 1 ? "1 endpoint" : `${leftOut} endpoints`;
  return `You left ${count} out in Select. The imports entry cannot keep that selection, so Manage lists ${leftOut === 1 ? "that one" : "those"} as endpoints you can add.`;
}

/**
 * After the files are written: what to add to the config so the source
 * appears in Studio, and the import's own entry, which Manage and the
 * update check read.
 *
 * @param props - The source's name, and what to declare
 * @returns The step
 * @example
 * ```tsx
 * <DeclareStep sourceName="billing" declaration={declaration} />
 * ```
 */
export function DeclareStep({
  sourceName,
  declaration,
}: {
  sourceName: string;
  declaration: ImportDeclaration;
}): React.ReactNode {
  const { configFile, source, importEntry, leftOut } = declaration;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 flex items-center gap-2 text-title font-semibold">
          <CheckCircle2 aria-hidden="true" className="size-4 text-ok" />
          Declare <span className="font-mono">{sourceName}</span> in {configFile}
        </h3>
        <p className="m-0 text-small text-fg-muted">
          Studio wrote the files and left {configFile} as it is.{" "}
          {source
            ? `${sourceName} appears in Studio — on this page, in the Explorer and in the Playground — once ${configFile} declares it under sources. Studio loads the config again when you save it.`
            : `${configFile} lists ${sourceName} under sources already, but does not declare the import.`}
        </p>
      </div>
      {source && (
        <>
          <Part
            label="Import the generated source at the top of the file:"
            code={source.importLine}
          />
          <Part label="Add it to sources:" code={source.entry} />
        </>
      )}
      {importEntry && (
        <>
          <Part
            label="Declare the import under imports — Studio checks and manages an import only from its declaration, and generates the endpoints you add with the options written there:"
            code={importEntry}
          />
          {leftOut > 0 && <p className="m-0 text-small text-fg-muted">{leftOutNote(leftOut)}</p>}
        </>
      )}
    </div>
  );
}
