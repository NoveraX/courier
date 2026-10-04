import { defineBoundary } from "@noverax/courier/define";

/** The endpoints a browser may call through the server, and how. */
export const boundary = defineBoundary({
  source: "api",
  expose: { "users.getAll": "query", "users.getById": "query", "users.create": "mutation" },
});
