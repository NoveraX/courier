/**
 * The route the import wizard asks through whether the variables an
 * import's auth names are set, as a page's auth reads them.
 */

import { isSecretVariableName } from "@noverax/courier/internal";
import { isRecord } from "@noverax/courier-cli/devkit";

import { IMPORT_AUTH_LIMITS } from "./import-auth";
import { variableValue } from "./import-auth-headers";
import { refusedElsewhere } from "./parse-credentials";
import type { JsonResponse, RouteRequest } from "./route-types";

/** The part of Studio's Express app the route is mounted on. */
export interface AuthVariablesRouteApp {
  post(path: string, handler: (req: RouteRequest, res: JsonResponse) => void): void;
}

/* A header auth's variables, and a basic auth's two. */
const MAX_NAMES = IMPORT_AUTH_LIMITS.headers + 2;

/**
 * Mount `POST /api/apis/auth-variables`: given `{ names }`, the environment
 * variables an import's auth names, it answers whether each is set where a
 * page's auth reads it: the project's `.env*` files set it, and Studio's
 * process holds a value for it. A value is never answered, and the route
 * is open only to a page
 * with the project's token, as every route the token guard does not list,
 * on the machine Studio runs on: another machine's page is refused 403
 * `NOT_LOCAL_PEER`, as it is a read with credentials.
 *
 * @param app - The Studio server's Express app
 * @param variables - The variables a page may name, as they are now
 * @example
 * ```ts
 * registerAuthVariablesRoute(app, () => pageVariables(projectEnv));
 * ```
 */
export function registerAuthVariablesRoute(
  app: AuthVariablesRouteApp,
  variables: () => Readonly<Record<string, string | undefined>>,
): void {
  app.post("/api/apis/auth-variables", (req, res) => {
    /* Whether a variable is set is the environment's to tell, as its value is. */
    if (refusedElsewhere(req, res)) return;
    const names = namesOf(req.body);
    if (names === null) {
      res.status(400).json({
        error: `names must list 1 to ${MAX_NAMES} environment variables, each written in capitals, digits and _, not starting with a digit.`,
        code: "SECRET_NAME_INVALID",
      });
      return;
    }
    const env = variables();
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
    (name): name is string => typeof name === "string" && isSecretVariableName(name),
  );
  return valid.length === listed.length ? [...new Set(valid)] : null;
}
