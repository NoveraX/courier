import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useApisContext } from "../../views/apis/apis-context";
import { UpdateView } from "../../views/apis/update-view";

function ApisUpdateRoute() {
  const { updateCtx, setUpdateCtx } = useApisContext();
  const navigate = useNavigate();

  if (!updateCtx) {
    void navigate({ to: "/apis/registry" });
    return null;
  }

  function handleBack() {
    setUpdateCtx(null);
    void navigate({ to: "/apis/registry" });
  }

  return <UpdateView ctx={updateCtx} onBack={handleBack} />;
}

export const Route = createFileRoute("/apis/update")({
  component: ApisUpdateRoute,
});
