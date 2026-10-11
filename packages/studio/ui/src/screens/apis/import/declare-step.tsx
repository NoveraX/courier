import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import type { UseConfigDeclare } from "@/apis/use-config-declare";
import { ChangePreview } from "@/design/code/change-preview";
import { leftOutNote } from "@/features/apis/left-out-note";
import type { ImportDeclaration } from "@/features/apis/types";
import { formatList } from "@/lib/formatters";
import { ManualDeclaration } from "./manual-declaration";

function Heading({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "busy";
  children: React.ReactNode;
}): React.ReactNode {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : Loader2;
  const color =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "animate-spin text-fg-subtle";
  return (
    <h3 className="m-0 flex items-center gap-2 text-title font-semibold">
      <Icon aria-hidden="true" className={`size-4 ${color}`} />
      {children}
    </h3>
  );
}

function Note({ children }: { children: React.ReactNode }): React.ReactNode {
  return <p className="m-0 text-small text-fg-muted">{children}</p>;
}

function Manual({
  name,
  reason,
  declaration,
}: {
  name: string;
  reason: string;
  declaration: ImportDeclaration | null;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <Heading tone="warn">
          Declare <span className="font-mono">{name}</span> in courier.config by hand
        </Heading>
        <Note>{reason}</Note>
      </div>
      {declaration && <ManualDeclaration declaration={declaration} />}
    </div>
  );
}

/**
 * After the files are written: the change that declares the import in
 * courier.config, for Studio to make with one click — the lines it adds and
 * nothing else, in each file it writes: the config, and the module the
 * config takes its `sources` from when the list lives there — then the API
 * in Studio. When Studio cannot make the change, the lines to add by hand,
 * and why.
 *
 * @param props - The source's name, what the config must still declare, and the change
 * @returns The step
 * @example
 * ```tsx
 * <DeclareStep sourceName="billing" declaration={declaration} declare={declare} />
 * ```
 */
export function DeclareStep({
  sourceName,
  declaration,
  declare,
}: {
  sourceName: string;
  declaration: ImportDeclaration;
  declare: UseConfigDeclare;
}): React.ReactNode {
  const { answer, error } = declare;
  const name = <span className="font-mono">{sourceName}</span>;
  if (error) return <Manual name={sourceName} reason={error} declaration={declaration} />;
  if (answer === null) return <Heading tone="busy">Reading {declaration.configFile}…</Heading>;
  if (answer.status === "manual") {
    return (
      <Manual
        name={sourceName}
        reason={answer.reason}
        declaration={answer.declaration ?? declaration}
      />
    );
  }
  if (answer.status === "applied" || answer.status === "declared") {
    return (
      <div className="flex flex-col gap-1.5">
        <Heading tone="ok">{name} is in Studio</Heading>
        <Note>
          {answer.status === "applied"
            ? `Studio added it to ${formatList(answer.files)} and loaded the config: it is on this page, in the Explorer and in the Playground.`
            : `${declaration.configFile} declares it already.`}
        </Note>
      </div>
    );
  }
  const files = answer.files.map((change) => change.file);
  const several = files.length > 1;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <Heading tone="ok">
          Files written — add {name} to {formatList(files)}
        </Heading>
        <Note>
          {answer.stale &&
            `${files.join(" or ")} changed since Studio read ${several ? "them" : "it"}; this is the change against ${several ? "them" : "it"} now. `}
          Studio lists an API — on this page, in the Explorer and in the Playground — once the
          config declares it.{" "}
          {several
            ? `The config takes its sources from ${declaration.sourcesFile ?? files[0]}, so the API is listed there and the import declared in ${answer.configFile}. Studio writes both files or neither, and changes nothing else in them.`
            : "Studio adds these lines and changes nothing else in the file."}
        </Note>
      </div>
      {answer.files.map((change) => (
        <ChangePreview key={change.file} target={change.file} hunks={change.hunks} />
      ))}
      {declaration.leftOut > 0 && <Note>{leftOutNote(declaration.leftOut)}</Note>}
    </div>
  );
}
