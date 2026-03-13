import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCodegenContext } from "../../views/codegen/codegen-context";
import { RegistryView } from "../../views/codegen/registry-view";

import type { UpdateContext } from "../../views/codegen/types";

function CodegenRegistryRoute() {
  const { setUpdateCtx } = useCodegenContext();
  const navigate = useNavigate();

  function handleImportNew() {
    void navigate({ to: "/codegen/import" });
  }

  function handleReviewUpdates(ctx: UpdateContext) {
    setUpdateCtx(ctx);
    void navigate({ to: "/codegen/update" });
  }

  return <RegistryView onImportNew={handleImportNew} onReviewUpdates={handleReviewUpdates} />;
}

export const Route = createFileRoute("/codegen/registry")({
  component: CodegenRegistryRoute,
});
