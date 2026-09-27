import { CodeBlock } from "@/components/shared/code-block";

import type { ImportDeclaration } from "./types";

interface DeclareStepProps {
  sourceName: string;
  declaration: ImportDeclaration;
}

function Part({ label, code }: { label: string; code: string }): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <p className="text-body-xs text-muted-foreground">{label}</p>
      <CodeBlock code={code} language="ts" />
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }): React.ReactElement {
  return <p className="text-body-sm text-muted-foreground">{children}</p>;
}

function leftOutNote(leftOut: number): string {
  const count = leftOut === 1 ? "1 endpoint" : `${leftOut} endpoints`;
  const those = leftOut === 1 ? "that one" : "those";
  return `You left ${count} out in Select. The imports entry cannot keep that selection, so Manage lists ${those} as endpoints you can add.`;
}

/**
 * The step after a write that left part of the declaration to courier.config:
 * Studio wrote the files and changed no config, so this shows what to add
 * there, each part copyable, and says what adding it does. An API appears in
 * Studio only once `sources` declares it. With the `imports` entry, it says
 * how many endpoints the Select step left out, since the entry cannot keep
 * that selection.
 *
 * @param props.sourceName - The import's name
 * @param props.declaration - What the config must still declare, as Studio answered
 * @returns The step
 *
 * @example
 * ```tsx
 * <DeclareStepView sourceName="pets" declaration={state.declaration} />
 * ```
 */
export function DeclareStepView({ sourceName, declaration }: DeclareStepProps): React.ReactElement {
  const { configFile, source, importEntry, leftOut } = declaration;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-h3 text-foreground">
          Declare <span className="font-mono">{sourceName}</span> in {configFile}
        </h3>
        <Note>
          Studio wrote the files and left {configFile} as it is.{" "}
          {source
            ? `${sourceName} appears in Studio — on this page, in the Explorer and in the Playground — once ${configFile} declares it under sources. Studio loads the config again when you save it.`
            : `${configFile} lists ${sourceName} under sources already, but does not declare the import.`}
        </Note>
      </div>
      {source && (
        <>
          <Part label="Import the generated source at the top of the file:" code={source.importLine} />
          <Part label="Add it to sources:" code={source.entry} />
        </>
      )}
      {importEntry && (
        <>
          <Part
            label="Declare the import under imports: Studio checks and manages an import only from its declaration, and generates the endpoints you add with the options written there."
            code={importEntry}
          />
          {leftOut > 0 && <Note>{leftOutNote(leftOut)}</Note>}
        </>
      )}
    </div>
  );
}
