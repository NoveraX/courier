import { contractKey, useContractStore } from "@/features/contract/contract-store";
import type { EndpointTag } from "@/features/explorer/endpoint-tags";
import { endpointTags } from "@/features/explorer/endpoint-tags";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { cn } from "@/lib/utils";

const TAG_CLASS: Readonly<Record<EndpointTag["tone"], string>> = {
  stream: "bg-brand-dim text-brand",
  mutation: "bg-syntax-keyword/12 text-syntax-keyword",
  query: "bg-raised text-fg-muted",
  agent: "bg-syntax-function/12 text-syntax-function",
  proxy: "bg-syntax-type/12 text-syntax-type",
  warn: "bg-warn-dim text-warn",
};

const CHIP =
  "flex h-4.75 items-center rounded-[5px] px-1.5 text-meta font-strong whitespace-nowrap";

/* An endpoint whose real answers differ from its response schema says so in its row. */
function DriftTag({ endpoint: e }: { endpoint: EndpointNode }): React.ReactNode {
  const id = e.group ? `${e.group}.${e.method}` : e.method;
  const drifted = useContractStore(
    (s) => s.byEndpoint.get(contractKey(e.source, id))?.state === "drifted",
  );
  if (!drifted) return null;
  return (
    <span title="Its answers differ from its response schema" className={cn(CHIP, TAG_CLASS.warn)}>
      drifted
    </span>
  );
}

/**
 * The tags an endpoint's row in the Endpoints list carries: `drifted` while
 * its answers differ from its response schema, then its kind, `agent`,
 * `proxy` and `untyped response` as `endpointTags` gives them.
 *
 * @param props - The endpoint
 * @returns The tags, for the row to lay out
 * @example
 * ```tsx
 * <span className="flex flex-wrap gap-1.25"><EndpointTagChips endpoint={endpoint} /></span>
 * ```
 */
export function EndpointTagChips({ endpoint }: { endpoint: EndpointNode }): React.ReactNode {
  return (
    <>
      <DriftTag endpoint={endpoint} />
      {endpointTags(endpoint).map((tag) => (
        <span key={tag.label} title={tag.title} className={cn(CHIP, TAG_CLASS[tag.tone])}>
          {tag.label}
        </span>
      ))}
    </>
  );
}
