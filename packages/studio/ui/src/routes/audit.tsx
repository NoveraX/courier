import { createFileRoute } from "@tanstack/react-router";

import { validateAuditSearch } from "@/features/audit/audit-search";
import { AuditScreen } from "@/screens/audit/audit-screen";

export const Route = createFileRoute("/audit")({
  component: AuditScreen,
  validateSearch: validateAuditSearch,
});
