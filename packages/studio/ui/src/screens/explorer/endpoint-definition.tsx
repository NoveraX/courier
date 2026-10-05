import { lastCallLabel } from "@/features/explorer/endpoint-key";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { cn } from "@/lib/utils";

const CHIP = "rounded-[5px] px-1.5 py-0.5 font-mono text-small whitespace-nowrap";

function Chip({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return <span className={cn(CHIP, className ?? "bg-raised text-fg")}>{children}</span>;
}

function schemaChip(name: string, declared: boolean): React.ReactNode {
  return (
    <Chip className={declared ? "bg-ok-dim text-ok" : "bg-warn-dim text-warn"}>
      {name} {declared ? "✓" : "—"}
    </Chip>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactNode {
  return (
    <div className="grid min-h-8 grid-cols-[108px_minmax(0,1fr)] items-center gap-3 border-b border-line">
      <dt className="text-control text-fg-subtle">{label}</dt>
      <dd className="m-0 flex flex-wrap items-center gap-1.25">{children}</dd>
    </div>
  );
}

/**
 * What an endpoint is, as its definition says: its path, its kind and
 * whether it is proxied, which schemas it declares, its middleware and
 * when it was last called.
 *
 * @param props - The endpoint and the time now
 * @returns The definition
 * @example
 * ```tsx
 * <EndpointDefinition endpoint={endpoint} now={Date.now()} />
 * ```
 */
export function EndpointDefinition({
  endpoint: e,
  now,
}: {
  endpoint: EndpointNode;
  now: number;
}): React.ReactNode {
  return (
    <div className="flex flex-col">
      <h3 className="pb-1.5 text-label font-semibold text-fg-muted">Definition</h3>
      <dl className="m-0">
        <Row label="Path">
          <span className="font-mono text-small text-fg">{e.path}</span>
        </Row>
        <Row label="Type">
          <Chip>{e.transport === "http" ? (e.type ?? "query") : e.transport.toUpperCase()}</Chip>
          {e.proxied && <Chip className="bg-syntax-type/12 text-syntax-type">proxy</Chip>}
        </Row>
        <Row label="Schemas">
          {schemaChip("input", e.hasVariablesSchema)}
          {schemaChip("output", e.hasResponseSchema)}
        </Row>
        <Row label="Middleware">
          {e.middleware.length === 0 && <span className="text-small text-fg-subtle">none</span>}
          {e.middleware.map((name) => (
            <Chip key={name} className="bg-raised text-fg-muted">
              {name}
            </Chip>
          ))}
        </Row>
        <Row label="Last call">
          <span className="font-mono text-small text-fg-muted">
            {lastCallLabel(e.metrics.last, now)}
          </span>
        </Row>
      </dl>
    </div>
  );
}
