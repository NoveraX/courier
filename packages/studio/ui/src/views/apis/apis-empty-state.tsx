import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

interface ApisEmptyStateProps {
  /** Opens the import wizard; left out while Import is refused. */
  action?: { label: string; onClick: () => void } | undefined;
}

/**
 * What the APIs page shows while Studio has no source to list. Studio lists
 * the sources `courier.config` declares and nothing else — it does not look
 * for API files in the project — so the text says where an API has to be
 * declared, whether it is written by hand or imported.
 *
 * @param props.action - Opens the import wizard, when Import is allowed
 * @returns The empty state
 *
 * @example
 * ```tsx
 * <ApisEmptyState action={{ label: "Import API", onClick: open }} />
 * ```
 */
export function ApisEmptyState({ action }: ApisEmptyStateProps): React.ReactElement {
  return (
    <EmptyState
      icon={BookOpen}
      heading="No APIs yet"
      description="Studio lists the APIs courier.config declares under sources. Write one by hand, or import an OpenAPI, Swagger or Postman spec to generate one, then declare it there."
      action={action}
    />
  );
}
