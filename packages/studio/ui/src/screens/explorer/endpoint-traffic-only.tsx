import { useNavigate } from "@tanstack/react-router";
import { FileCode2 } from "lucide-react";
import { useState } from "react";

import { declareFromTraffic } from "@/features/explorer/declare-from-traffic";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { useStudioStore } from "@/store";
import { EndpointDeclaredElsewhere } from "./endpoint-declared-elsewhere";

const SECTION = "flex flex-col gap-2 rounded-panel border border-line bg-panel-subtle p-3";

/**
 * For an endpoint known only by its traffic, what that means and what to do.
 * When its source is defined in the app's code, not declared in
 * courier.config: the way to declare the source from what Studio recorded —
 * its endpoints, routes and schemas read from the calls, written as code
 * once the import wizard has shown it. When the config declares the source
 * but not this endpoint: what that means for the source, and what to do.
 *
 * @param props - The endpoint
 * @returns The section, or nothing for an endpoint the config declares
 * @example
 * ```tsx
 * <EndpointTrafficOnly endpoint={endpoint} />
 * ```
 */
export function EndpointTrafficOnly({ endpoint }: { endpoint: EndpointNode }): React.ReactNode {
  const navigate = useNavigate();
  const [reading, setReading] = useState(false);
  const declaredIn = useStudioStore(
    (s) =>
      s.scanSources.find((source) => source.name.toLowerCase() === endpoint.source.toLowerCase())
        ?.filePath,
  );
  if (!endpoint.trafficOnly) return null;
  if (declaredIn !== undefined)
    return <EndpointDeclaredElsewhere endpoint={endpoint} file={declaredIn} />;
  const declare = async () => {
    setReading(true);
    const asked = await declareFromTraffic(endpoint.source);
    setReading(false);
    if (asked) void navigate({ to: "/apis" });
  };
  return (
    <section aria-label="Known only by its traffic" className={SECTION}>
      <h3 className="m-0 text-label font-semibold text-fg-muted">Known only by its traffic</h3>
      <p className="m-0 text-small text-fg-muted">
        courier.config does not declare {endpoint.source}: Studio knows its endpoints from the calls
        it recorded. Declare it from them — each route, its parameters and the schemas of what it
        was sent and answered — and the import shows the code before writing it.
      </p>
      <button
        type="button"
        disabled={reading}
        onClick={() => void declare()}
        className="flex h-7.5 w-max max-w-full cursor-pointer items-center gap-1.75 rounded-control bg-fg px-3 text-small font-semibold text-bg hover:bg-fg/90 disabled:cursor-default disabled:opacity-50 pointer-coarse:h-9"
      >
        <FileCode2 aria-hidden="true" className="size-3.25" />
        {reading ? "Reading its traffic…" : `Declare ${endpoint.source} from traffic`}
      </button>
    </section>
  );
}
