/**
 * The words the fixture names things with: what a large company's APIs
 * hold, the parts of a record, and the areas of its applications.
 */

/** What a group of endpoints is about, one per group: plural, as a URL path names it. */
export const ENTITIES = [
  ...["accounts", "projects", "tasks", "boards", "sprints", "epics", "milestones", "workspaces"],
  ...["teams", "members", "roles", "permissions", "invites", "sessions", "devices", "tokens"],
  ...["invoices", "payments", "refunds", "subscriptions", "plans", "coupons", "credits", "taxes"],
  ...["ledgers", "payouts", "disputes", "receipts", "quotes", "contracts", "budgets", "expenses"],
  ...["products", "variants", "categories", "brands", "collections", "inventories", "warehouses"],
  ...["shipments", "carriers", "returns", "orders", "carts", "wishlists", "reviews", "ratings"],
  ...["suppliers", "purchases", "catalogs", "prices", "discounts", "bundles", "listings", "stores"],
  ...["users", "profiles", "groups", "policies", "audits", "consents", "identities", "domains"],
  ...["organizations", "departments", "locations", "offices", "assets", "licenses", "vendors"],
  ...["reports", "dashboards", "metrics", "events", "funnels", "cohorts", "segments", "goals"],
  ...["experiments", "alerts", "monitors", "incidents", "queries", "exports", "datasets", "charts"],
  ...["tickets", "conversations", "messages", "channels", "articles", "macros", "surveys", "forms"],
  ...["campaigns", "audiences", "templates", "emails", "notifications", "webhooks", "schedules"],
  ...["documents", "folders", "files", "comments", "labels", "tags", "links", "snippets"],
  ...["releases", "builds", "deployments", "pipelines", "environments", "secrets", "services"],
  ...["clusters", "nodes", "volumes", "backups", "regions", "zones", "networks", "gateways"],
  ...["courses", "lessons", "quizzes", "grades", "certificates", "enrollments", "instructors"],
  ...["patients", "visits", "prescriptions", "claims", "providers", "appointments", "referrals"],
  ...["properties", "units", "leases", "tenants", "inspections", "showings", "agents", "offers"],
  ...["vehicles", "drivers", "routes", "trips", "fuelings", "repairs", "parts", "depots"],
  ...["recipes", "menus", "ingredients", "kitchens", "tables", "reservations", "shifts", "staff"],
  ...["matches", "players", "leagues", "seasons", "venues", "passes", "sponsors", "broadcasts"],
  ...["papers", "authors", "journals", "citations", "grants", "labs", "samples", "protocols"],
  ...["coverages", "quotas", "limits", "usage", "statements", "meters", "rates", "tiers"],
];

/** What a group inside a group holds about its parent's records. */
export const CHILDREN = ["notes", "attachments", "versions", "activity", "watchers", "links"];

/** The actions a group may have beyond reading and writing its records. */
export const ACTIONS = ["archive", "restore", "search", "export", "duplicate", "history", "stats"];

/** The areas of the company's applications, where the code that calls the APIs lives. */
export const AREAS = [
  ...["admin", "billing", "checkout", "catalog", "crm", "support", "analytics", "growth"],
  ...["onboarding", "settings", "reporting", "fulfilment", "marketplace", "partners", "mobile"],
  ...["compliance", "security", "integrations", "notifications", "search"],
];

/** The company's internal libraries the applications build on. */
export const LIBRARIES = [
  ...["format", "money", "dates", "permissions", "feature-flags", "telemetry", "cache", "retry"],
  ...["validation", "i18n", "auth", "paging", "csv", "pdf", "images", "geo", "queue", "mailer"],
  ...["audit-trail", "rate-limit", "search-index", "pricing", "tax", "currency", "addresses"],
  ...["phone", "slugs", "colors", "charts", "tables", "forms", "router", "state", "storage"],
  ...["crypto", "ids", "diff", "markdown", "sanitize"],
];
