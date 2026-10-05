import { Network } from "lucide-react";

/**
 * What the Explorer says before it knows of any endpoint: Courier lists the
 * ones the config file defines, and those this session's traffic reveals.
 *
 * @returns The notice
 * @example
 * ```tsx
 * {model.endpoints.length === 0 && <ExplorerEmpty />}
 * ```
 */
export function ExplorerEmpty(): React.ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
      <Network aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="text-ui font-strong">No endpoints yet</p>
      <p className="max-w-90 text-small text-fg-subtle">
        The Explorer lists the sources your courier config defines, and the endpoints this
        session&apos;s traffic calls.
      </p>
    </div>
  );
}
