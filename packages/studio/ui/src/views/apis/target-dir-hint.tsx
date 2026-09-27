import { useImportLayout } from "./use-import-layout";

interface TargetDirHintProps {
  outputDir: string;
  sourceName: string;
}

/** Where Studio will write the import's files, as Studio answers it, or why it refuses. */
export function TargetDirHint({ outputDir, sourceName }: TargetDirHintProps): React.ReactElement {
  const layout = useImportLayout(outputDir, sourceName);
  return (
    <>
      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
        <span className="text-body-xs text-muted-foreground">Files will be written to</span>
        <code className="mono-xs text-foreground">{layout.dir ?? "…"}</code>
      </div>
      {layout.error && <p className="text-xs text-destructive">{layout.error}</p>}
    </>
  );
}
