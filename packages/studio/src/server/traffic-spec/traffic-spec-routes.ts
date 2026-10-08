import type { RouteApp } from "../route-types";
import { isObject } from "../validate-body";
import { openapiFromTraffic, type TrafficCall } from "./openapi-from-traffic";

/* As many calls as a page keeps. */
const MOST_CALLS = 10_000;

/**
 * Mount the route that reads an OpenAPI document from a source's traffic,
 * for the import wizard to turn into code:
 *
 * POST /api/apis/traffic-spec — `{ source, calls }` → the document, as text, with what it was read from
 *
 * It reads only what the page sends, and writes nothing.
 *
 * @param app - The Studio server's Express app
 * @example
 * ```ts
 * registerTrafficSpecRoutes(app);
 * ```
 */
export function registerTrafficSpecRoutes(app: RouteApp): void {
  app.post("/api/apis/traffic-spec", (req, res) => {
    const body = isObject(req.body) ? req.body : {};
    const { source, calls } = body;
    if (typeof source !== "string" || source.trim() === "" || !Array.isArray(calls)) {
      res.status(400).json({ error: "Send the source's name and its calls: { source, calls }." });
      return;
    }
    if (calls.length > MOST_CALLS) {
      res.status(413).json({ error: `A document is read from ${MOST_CALLS} calls at most.` });
      return;
    }
    const spec = openapiFromTraffic(source, calls.flatMap(callOf));
    res.json({ ...spec, text: `${JSON.stringify(spec.document, null, 2)}\n` });
  });
}

function callOf(value: unknown): TrafficCall[] {
  if (!isObject(value) || typeof value.method !== "string") return [];
  const { group, method, httpMethod, url, variables, status, data, dataCut, transport } = value;
  return [
    {
      group: typeof group === "string" ? group : "",
      method,
      httpMethod: typeof httpMethod === "string" ? httpMethod : undefined,
      url: typeof url === "string" && URL.canParse(url) ? url : undefined,
      variables,
      status: typeof status === "number" ? status : undefined,
      data,
      dataCut: dataCut === true,
      transport: transport === "sse" || transport === "ws" ? transport : "http",
    },
  ];
}
