/**
 * The route the import wizard asks through whether Studio's environment
 * sets the variables an import's auth names.
 */

import { isRecord } from "@noverax/courier-cli/devkit";

import { IMPORT_AUTH_LIMITS, isVariableName } from "./import-auth";
import { variableValue } from "./import-auth-headers";
import type { JsonResponse, RouteRequest } from "./route-types";

/** The part of Studio's Express app the route is mounted on. */
export interface AuthVariablesRouteApp {
  post(path: string, handler: (req: RouteRequest, res: JsonResponse) => void): void;
}

/* A header auth's variables, and a basic auth's two. */
const MAX_NAMES = IMPORT_AUTH_LIMITS.headers + 2;

/**
 * Mount `POST /api/apis/auth-variables`: given `{ names }`, the environment
 * variables an import's auth names, it answers whether Studio's environment
 * — its process's, which takes the project's `.env*` files in — sets each
 * one. A value is never answered, and the route is open only to a page
 * with the project's token, as every route the token guard does not list.
 *
 * @param app - The Studio server's Express app
 * @param env - The environment the variables are looked up in
 * @example
 * ```ts
 * registerAuthVariablesRoute(app);
 * ```
 */
export function registerAuthVariablesRoute(
  app: AuthVariablesRouteApp,
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  app.post("/api/apis/auth-variables", (req, res) => {
    const names = namesOf(req.body);
    if (names === null) {
      res.status(400).json({
        error: `names must list 1 to ${MAX_NAMES} environment variables: letters, digits and _, not starting with a digit.`,
        code: "SECRET_NAME_INVALID",
      });
      return;
    }
    res.json({
      variables: names.map((name) => ({ name, set: variableValue(env, name) !== undefined })),
    });
  });
}

function namesOf(body: unknown): string[] | null {
  const names: unknown = isRecord(body) ? body.names : undefined;
  if (!Array.isArray(names) || names.length === 0 || names.length > MAX_NAMES) return null;
  const listed: readonly unknown[] = names;
  const valid = listed.filter(
    (name): name is string => typeof name === "string" && isVariableName(name),
  );
  return valid.length === listed.length ? [...new Set(valid)] : null;
}
