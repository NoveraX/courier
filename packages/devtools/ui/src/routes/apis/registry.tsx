import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useApisContext } from "../../views/apis/apis-context";
import { RegistryView } from "../../views/apis/registry-view";

import type { UpdateContext } from "../../views/apis/types";

function ApisRegistryRoute() {
  const { setUpdateCtx } = useApisContext();
  const navigate = useNavigate();

  function handleImportNew() {
    void navigate({ to: "/apis/import" });
  }

  function handleReviewUpdates(ctx: UpdateContext) {
    setUpdateCtx(ctx);
    void navigate({ to: "/apis/update" });
  }

  return <RegistryView onImportNew={handleImportNew} onReviewUpdates={handleReviewUpdates} />;
}

export const Route = createFileRoute("/apis/registry")({
  component: ApisRegistryRoute,
});
