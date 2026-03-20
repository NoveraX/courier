import type { RouteInfo } from "./route-analyzer";

/**
 * Infer routes from scenario endpoint names using REST conventions.
 * Used in standalone mode (no source definition).
 *
 * Convention: endpoint name → HTTP method + path
 *   getAll        → GET  /{group}
 *   getById       → GET  /{group}/:id
 *   getBy{Field}  → GET  /{group}?{field}=...
 *   create        → POST /{group}
 *   update        → PATCH /{group}/:id
 *   replace       → PUT   /{group}/:id
 *   upsert        → PUT   /{group}
 *   delete        → DELETE /{group}/:id
 *   deleteAll     → DELETE /{group}
 */
export function inferRoutes(endpoints: Array<{ group: string; endpoint: string }>): RouteInfo[] {
  return endpoints.map(({ group, endpoint }) => {
    const prefix = `/${group}`;
    const mapped = mapEndpointName(endpoint);

    const fullPath = mapped.path ? `${prefix}/${mapped.path}`.replace(/\/+/g, "/") : prefix;

    return {
      group,
      endpoint,
      httpMethod: mapped.httpMethod,
      path: mapped.path,
      fullPath,
      hasIdParam: mapped.path.includes(":id"),
      operation: mapped.operation,
    };
  });
}

interface MappedRoute {
  httpMethod: string;
  path: string;
  operation: RouteInfo["operation"];
}

const KNOWN_PATTERNS: Array<{
  test: (name: string) => boolean;
  map: (name: string) => MappedRoute;
}> = [
  // Exact matches
  {
    test: (n) => n === "getAll" || n === "list" || n === "findAll" || n === "findMany",
    map: () => ({ httpMethod: "GET", path: "", operation: "list" }),
  },
  {
    test: (n) => n === "getById" || n === "findById" || n === "findOne",
    map: () => ({ httpMethod: "GET", path: ":id", operation: "get" }),
  },
  {
    test: (n) => n === "create" || n === "add" || n === "insert",
    map: () => ({ httpMethod: "POST", path: "", operation: "create" }),
  },
  {
    test: (n) => n === "update" || n === "patch" || n === "edit",
    map: () => ({ httpMethod: "PATCH", path: ":id", operation: "update" }),
  },
  {
    test: (n) => n === "updateStatus",
    map: () => ({ httpMethod: "PATCH", path: ":id", operation: "update" }),
  },
  {
    test: (n) => n === "replace" || n === "put",
    map: () => ({ httpMethod: "PUT", path: ":id", operation: "replace" }),
  },
  {
    test: (n) => n === "upsert",
    map: () => ({ httpMethod: "PUT", path: "", operation: "upsert" }),
  },
  {
    test: (n) => n === "delete" || n === "remove",
    map: () => ({ httpMethod: "DELETE", path: ":id", operation: "delete" }),
  },
  {
    test: (n) => n === "deleteAll" || n === "removeAll" || n === "clear",
    map: () => ({ httpMethod: "DELETE", path: "", operation: "deleteAll" }),
  },

  // Prefix patterns: getBy{Field} → GET with query param
  {
    test: (n) => /^(get|find|fetch)By[A-Z]/.test(n),
    map: () => ({ httpMethod: "GET", path: "", operation: "list" }),
  },

  // Prefix patterns: create/add/insert* → POST
  {
    test: (n) => /^(create|add|insert)/.test(n),
    map: () => ({ httpMethod: "POST", path: "", operation: "create" }),
  },

  // Prefix patterns: update/patch/edit* → PATCH
  {
    test: (n) => /^(update|patch|edit)/.test(n),
    map: () => ({ httpMethod: "PATCH", path: ":id", operation: "update" }),
  },

  // Prefix patterns: delete/remove* → DELETE
  {
    test: (n) => /^(delete|remove)/.test(n),
    map: () => ({ httpMethod: "DELETE", path: ":id", operation: "delete" }),
  },

  // Prefix patterns: get/find/fetch/list* → GET
  {
    test: (n) => /^(get|find|fetch|list|search|query)/.test(n),
    map: () => ({ httpMethod: "GET", path: "", operation: "list" }),
  },
];

function mapEndpointName(name: string): MappedRoute {
  for (const pattern of KNOWN_PATTERNS) {
    if (pattern.test(name)) return pattern.map(name);
  }

  // Fallback: unknown name → GET
  return { httpMethod: "GET", path: "", operation: "custom" };
}
