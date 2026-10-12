import { toast } from "sonner";

import type { EndpointContract as Contract } from "@/features/contract/contract-report";
import { contractKey, refreshContract, useContractStore } from "@/features/contract/contract-store";
import { openSchemaFix } from "@/features/contract/schema-fix-store";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { post } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/screens/welcome/copy-button";
import { ContractDriftList } from "./contract-drift-list";

const STATE: Readonly<Record<Contract["state"], { label: string; tone: string }>> = {
  confirmed: { label: "Confirmed by traffic", tone: "text-ok" },
  drifted: { label: "Drifted from its schema", tone: "text-warn" },
  unobserved: { label: "Not observed yet", tone: "text-fg-subtle" },
};

function summary(contract: Contract): string {
  if (contract.state === "unobserved")
    return "No answer of it has been seen to set beside its schema.";
  if (contract.state === "confirmed")
    return `Every one of ${contract.calls} answers fits its response schema.`;
  return `${contract.drift.length} difference${contract.drift.length === 1 ? "" : "s"} across ${contract.calls} answers.`;
}

/* The fix as it is pasted: each object's fields under the object they go in. */
function fixText(contract: Contract): string {
  const groups = new Map<string, Contract["fix"]>();
  for (const fix of contract.fix) groups.set(fix.within, [...(groups.get(fix.within) ?? []), fix]);
  return [...groups]
    .map(([within, fixes]) =>
      [`// in ${withinLabel(within)}`, ...fixes.map((fix) => `${fix.line},`)].join("\n"),
    )
    .join("\n\n");
}

/* `""` is the answer itself; `items[]` each item of `items`. */
function withinLabel(within: string): string {
  if (within === "") return "the answer";
  if (within.endsWith("[]")) return `each item of ${withinLabel(within.slice(0, -2))}`;
  return within;
}

async function forget(contract: Contract): Promise<void> {
  try {
    await post("/api/contract/forget", { source: contract.source, endpoint: contract.endpoint });
    toast.success(
      `Forgot what was seen of ${contract.endpoint}; its next answers are checked afresh`,
    );
    await refreshContract();
  } catch (error) {
    toast.error(`Could not forget it: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * An endpoint's contract against its real answers: confirmed by traffic,
 * drifted from its response schema — each difference with when and how
 * often it was seen and from where, and the fields to declare so the
 * schema takes the answers — or not observed yet; and the way to forget
 * what was seen once the schema is fixed.
 *
 * @param props - The endpoint, and the time now
 * @returns The section, or nothing for an endpoint without a response schema
 * @example
 * ```tsx
 * <EndpointContract endpoint={endpoint} now={now} />
 * ```
 */
export function EndpointContract({
  endpoint,
  now,
}: {
  endpoint: EndpointNode;
  now: number;
}): React.ReactNode {
  const id = endpoint.group ? `${endpoint.group}.${endpoint.method}` : endpoint.method;
  const contract = useContractStore((s) => s.byEndpoint.get(contractKey(endpoint.source, id)));
  if (!endpoint.hasResponseSchema || !contract) return null;
  const state = STATE[contract.state];
  return (
    <section aria-label="Contract" className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-label font-semibold text-fg-muted">Contract</h3>
        <span className={cn("text-label font-strong", state.tone)}>{state.label}</span>
      </div>
      <p className="m-0 text-small text-fg-muted">
        {summary(contract)}
        {contract.cut > 0 && ` ${contract.cut} were too large to see whole.`}
      </p>
      {contract.drift.length > 0 && (
        <ContractDriftList drift={contract.drift} calls={contract.calls} now={now} />
      )}
      {contract.fix.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-panel bg-inset p-3">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-small text-fg">Declare in its response schema</span>
            <CopyButton text={fixText(contract)} />
          </div>
          <pre className="m-0 overflow-auto font-mono text-small text-fg-muted">
            {fixText(contract)}
          </pre>
          {contract.vendor === "zod" ? (
            <button
              type="button"
              onClick={() =>
                openSchemaFix({ source: contract.source, endpoint: contract.endpoint })
              }
              className="h-7 w-max cursor-pointer rounded-control bg-brand px-2.5 text-small font-semibold text-bg hover:bg-brand/90 pointer-coarse:h-9 pointer-coarse:px-3"
            >
              Fix the schema…
            </button>
          ) : (
            <p className="m-0 text-small text-fg-subtle">
              Studio writes the change itself for a Zod schema; this one is{" "}
              {contract.vendor ?? "another library's"}.
            </p>
          )}
        </div>
      )}
      {contract.calls > 0 && (
        <button
          type="button"
          onClick={() => void forget(contract)}
          className="h-7 w-max cursor-pointer rounded-control border border-line px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg pointer-coarse:h-9 pointer-coarse:px-3"
        >
          Forget what was seen
        </button>
      )}
    </section>
  );
}
