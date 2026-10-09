import { useNavigate } from "@tanstack/react-router";
import { FilePlus2 } from "lucide-react";

import { useManageRequest } from "@/features/apis/manage-request";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { useStudioStore } from "@/store";

const SECTION = "flex flex-col gap-2 rounded-panel border border-line bg-panel-subtle p-3";

/**
 * For an endpoint of a source courier.config declares, which the
 * declaration does not have: for a source declared from its traffic, the
 * way to add the endpoint from the calls Studio recorded, which the import's
 * manage dialog shows before writing; for any other, that the app runs
 * another version of the source than the one Studio read, and where that
 * one is.
 *
 * @param props - The endpoint, and the file Studio read its source from
 * @returns The section
 * @example
 * ```tsx
 * <EndpointDeclaredElsewhere endpoint={endpoint} file="src/api/shop.ts" />
 * ```
 */
export function EndpointDeclaredElsewhere({
  endpoint,
  file,
}: {
  endpoint: EndpointNode;
  file: string;
}): React.ReactNode {
  const navigate = useNavigate();
  const fromTraffic = useStudioStore((s) =>
    s.registrySources.some((one) => one.name === endpoint.source && one.fromTraffic === true),
  );
  const { source } = endpoint;
  const name = endpoint.group ? `${endpoint.group}.${endpoint.method}` : endpoint.method;
  const location = <code className="font-mono text-fg">{file}</code>;
  if (!fromTraffic) {
    return (
      <section aria-label="Called, but not declared" className={SECTION}>
        <h3 className="m-0 text-label font-semibold text-fg-muted">Called, but not declared</h3>
        <p className="m-0 text-small text-fg-muted">
          courier.config declares {source} in {location}, but not {name}. The app called it, so the
          app runs another version of {source} than the one Studio read: one built before a change
          to that file, or a definition the config does not import. Restart the app, or point the
          config at the definition the app uses.
        </p>
      </section>
    );
  }
  const add = () => {
    useManageRequest.setState({
      request: { source, picked: { group: endpoint.group, name: endpoint.method } },
    });
    void navigate({ to: "/apis" });
  };
  return (
    <section aria-label="Called, but not declared" className={SECTION}>
      <h3 className="m-0 text-label font-semibold text-fg-muted">Called, but not declared</h3>
      <p className="m-0 text-small text-fg-muted">
        {source} was declared from its traffic, in {location}, before the app called {name}. Add it
        from the calls Studio recorded — its route, its parameters and the schemas of what it was
        sent and answered — and the import shows the change before writing it.
      </p>
      <button
        type="button"
        onClick={add}
        className="flex h-7.5 w-max cursor-pointer items-center gap-1.75 rounded-control bg-fg px-3 text-small font-semibold text-bg hover:bg-fg/90"
      >
        <FilePlus2 aria-hidden="true" className="size-3.25" />
        {`Add ${name} from traffic`}
      </button>
    </section>
  );
}
