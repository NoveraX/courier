import {
  buildClientProxy,
  type Context,
  createLogger,
  type ExecuteBackend,
  executeRequest,
  type TypedClient,
  type ValidationIssue,
} from "@noverax/courier";
import type { DefinedApi } from "@noverax/courier/define";

const log = createLogger("Next");

/** State returned by server actions for useActionState */
export type ActionState<TData = unknown> = {
  data: TData | null;
  error: {
    message: string;
    status?: number;
    issues?: readonly ValidationIssue[];
  } | null;
};

/** Configuration for createAction */
export type ActionDefaults = {
  /** Forward incoming request headers to the API via next/headers (default: true) */
  headers?: boolean;
};

async function getRequestHeaders(): Promise<Headers | undefined> {
  try {
    const { headers } = await import("next/headers");
    return await headers();
  } catch (error) {
    /* Called outside a request — a script, a build step — there are simply
       no headers to forward. */
    log.debug("No request headers to forward", error);
    return undefined;
  }
}

/**
 * Create a dot-notation server-side caller for Next.js Server Actions.
 * Automatically forwards request headers via `next/headers`.
 *
 * @param sources - Sources map (same object passed to `apiRoute`)
 * @param source - Source name (key in the sources map)
 * @param defaults - Optional configuration
 *
 * @example
 * ```ts
 * // lib/actions.ts
 * import { createAction } from "@noverax/courier-next"
 * import { sources } from "@/api"
 *
 * export const action = createAction(sources, "api")
 * ```
 *
 * ```ts
 * // app/actions/users.ts
 * "use server"
 * import { revalidatePath } from "next/cache"
 * import { action } from "@/lib/actions"
 *
 * export async function createUser(data: { name: string; email: string }) {
 *   const user = await action.users.create(data)
 *   revalidatePath("/users")
 *   return user
 * }
 * ```
 */
export function createAction<
  TSources extends Record<string, DefinedApi<any>>,
  TKey extends string & keyof TSources,
>(sources: TSources, source: TKey, defaults: ActionDefaults = {}): TypedClient<TSources[TKey]> {
  const backend: ExecuteBackend = async (group, method, variables, options, raw) => {
    const context: Context | undefined =
      defaults.headers !== false
        ? { headers: (await getRequestHeaders()) ?? undefined }
        : undefined;

    /* `.raw` and `.with({ ... })` compile here as on any caller, and used to
       be dropped: `.raw` returned the bare body, and a per-call header or
       timeout never reached the request. */
    return executeRequest(
      sources,
      {
        source,
        group,
        method,
        variables: variables as Record<string, unknown>,
        options: raw ? { ...options, rawData: true } : options,
      },
      context,
    );
  };

  return buildClientProxy(backend) as TypedClient<TSources[TKey]>;
}
