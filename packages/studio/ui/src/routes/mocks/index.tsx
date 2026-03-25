import { createFileRoute, Navigate } from "@tanstack/react-router";

function MocksIndex(): React.ReactNode {
  return <Navigate to="/mocks/dashboard" replace />;
}

export const Route = createFileRoute("/mocks/")({
  component: MocksIndex,
});
