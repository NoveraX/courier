import { FileCode } from "lucide-react";

import { CodeBlock } from "@/components/shared/code-block";
import { EmptyState } from "@/components/shared/empty-state";
import { copyToClipboard } from "@/lib/clipboard";

import { MINIMAL_CONFIG } from "./minimal-config";

/**
 * The APIs page of a project without `courier.config.ts`: the file to
 * create, the config to start it from when there are no API sources yet,
 * and a button that copies it. Import API stays off until the file loads.
 *
 * @returns The page's centred state
 *
 * @example
 * ```tsx
 * {page.kind === "no-config" && <NoConfigState />}
 * ```
 */
export function NoConfigState(): React.ReactElement {
  return (
    <EmptyState
      icon={FileCode}
      heading="No courier.config.ts"
      description="Create courier.config.ts at the project root. A project with no API sources yet starts from this config; Studio loads it as soon as it is saved, and Import API turns on."
      action={{
        label: "Copy config",
        onClick: () => void copyToClipboard(MINIMAL_CONFIG, "config"),
      }}
    >
      <div className="w-[480px] max-w-full text-left">
        <CodeBlock code={MINIMAL_CONFIG} language="ts" />
      </div>
    </EmptyState>
  );
}
