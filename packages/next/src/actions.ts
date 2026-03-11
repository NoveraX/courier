import {
  buildClientProxy,
  type Context,
  type ExecuteBackend,
  executeRequest,
  type TypedClient,
  type ValidationIssue,
} from "@noverax/nexus";
import type { DefinedApi } from "@noverax/nexus/define";

/** State returned by server actions for useActionState */
export type ActionState<T = unknown> = {
  data: T | null;
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
  } catch {
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
 * import { createAction } from "@noverax/nexus-next"
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
export function createAction<S extends Record<string, DefinedApi<any>>, K extends string & keyof S>(
  sources: S,
  source: K,
  defaults: ActionDefaults = {},
): TypedClient<S[K]> {
  const backend: ExecuteBackend = async (group, method, variables, _options, _raw) => {
    const context: Context | undefined =
      defaults.headers !== false
        ? { headers: (await getRequestHeaders()) ?? undefined }
        : undefined;

    return executeRequest(
      sources,
      { source, group, method, variables: variables as Record<string, unknown> },
      context,
    );
  };

  return buildClientProxy(backend) as TypedClient<S[K]>;
}
