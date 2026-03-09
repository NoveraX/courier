import {
  type Context,
  executeRequest,
  HTTPError,
  parseEndpointKey,
  ValidationError,
  type ValidationIssue,
} from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";

/** State returned by server actions for useActionState */
export type ActionState<T = unknown> = {
  data: T | null;
  error: {
    message: string;
    status?: number;
    issues?: readonly ValidationIssue[];
  } | null;
};

/** Configuration for server action behavior */
export type ActionOptions = {
  /** Path(s) to revalidate after successful mutation */
  revalidatePath?: string | string[];
  /** Tag(s) to revalidate after successful mutation */
  revalidateTag?: string | string[];
  /** Cache profile for revalidateTag (Next.js 16+, default: "default") */
  cacheProfile?: string | { expire?: number };
  /** Custom FormData parser. Default: Object.fromEntries. Use "raw" to pass FormData directly (file uploads). */
  parse?: "raw" | ((formData: FormData) => Record<string, unknown>);
  /** Forward incoming request headers to the API via next/headers (default: true) */
  headers?: boolean;
};

/** Server action function compatible with React 19 useActionState */
export type ServerAction<T = unknown> = (
  prevState: ActionState<T>,
  formData: FormData,
) => Promise<ActionState<T>>;

function parseVariables(
  formData: FormData,
  parse?: ActionOptions["parse"],
): FormData | Record<string, unknown> {
  if (parse === "raw") return formData;
  if (typeof parse === "function") return parse(formData);
  return Object.fromEntries(formData.entries());
}

async function performRevalidation(options?: ActionOptions) {
  if (!options?.revalidatePath && !options?.revalidateTag) return;

  const cache = await import("next/cache");

  if (options.revalidatePath) {
    const paths = Array.isArray(options.revalidatePath)
      ? options.revalidatePath
      : [options.revalidatePath];
    for (const p of paths) cache.revalidatePath(p);
  }

  if (options.revalidateTag) {
    const tags = Array.isArray(options.revalidateTag)
      ? options.revalidateTag
      : [options.revalidateTag];
    const profile = options.cacheProfile ?? "default";
    for (const t of tags) cache.revalidateTag(t, profile);
  }
}

async function getRequestHeaders(): Promise<Headers | undefined> {
  try {
    const { headers } = await import("next/headers");
    return await headers();
  } catch {
    return undefined;
  }
}

function extractErrorMessage(error: HTTPError): string {
  if (typeof error.data === "object" && error.data !== null && "message" in error.data) {
    return String((error.data as { message: unknown }).message);
  }
  return `HTTP ${error.status}`;
}

/**
 * Create type-safe server actions from Nexus API sources.
 *
 * @example
 * ```typescript
 * "use server";
 * import { createAction } from "@noverax/nexus/next/actions";
 * import { sources } from "./api";
 *
 * export const createUser = createAction(sources)("api")("users:create", {
 *   revalidatePath: "/users",
 * });
 *
 * // Client component:
 * const [state, formAction, isPending] = useActionState(createUser, { data: null, error: null });
 * ```
 */
export function createAction(sources: Sources) {
  return function selectSource(source: string) {
    return function selectEndpoint(endpoint: string, options?: ActionOptions): ServerAction {
      const { group, method } = parseEndpointKey(endpoint);

      return async (_prevState, formData) => {
        try {
          const variables = parseVariables(formData, options?.parse);

          const context: Context | undefined =
            options?.headers !== false
              ? { headers: (await getRequestHeaders()) ?? undefined }
              : undefined;

          const data = await executeRequest(
            sources,
            // FormData variables are supported at runtime via parseRequestPayload
            { source, group, method, variables: variables as Record<string, unknown> },
            context,
          );

          await performRevalidation(options);

          return { data, error: null };
        } catch (error) {
          if (error instanceof ValidationError) {
            return {
              data: null,
              error: {
                message: error.message,
                status: 422,
                issues: error.issues,
              },
            };
          }

          if (error instanceof HTTPError) {
            return {
              data: null,
              error: {
                message: extractErrorMessage(error),
                status: error.status,
              },
            };
          }

          return {
            data: null,
            error: {
              message: error instanceof Error ? error.message : "Unknown error",
            },
          };
        }
      };
    };
  };
}
