import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCodegenContext } from "../../views/codegen/codegen-context";
import { UpdateView } from "../../views/codegen/update-view";

function CodegenUpdateRoute() {
  const { updateCtx, setUpdateCtx } = useCodegenContext();
  const navigate = useNavigate();

  if (!updateCtx) {
    void navigate({ to: "/codegen/registry" });
    return null;
  }

  function handleBack() {
    setUpdateCtx(null);
    void navigate({ to: "/codegen/registry" });
  }

  return <UpdateView ctx={updateCtx} onBack={handleBack} />;
}

export const Route = createFileRoute("/codegen/update")({
  component: CodegenUpdateRoute,
});
