import { createLogger } from "../logger";

const log = createLogger("Adapter");

const META_KEYS = new Set(["_s", "_g", "_m", "_o", "_transport"]);

export { META_KEYS };

export function errorResponse(status: number, message: string): Response {
  return Response.json({ success: false, message }, { status });
}

export function parseOptions(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw, (key, value) => {
      // Prevent prototype pollution
      if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
      return value;
    });
  } catch {
    log.warn("Failed to parse options header");
    return undefined;
  }
}
