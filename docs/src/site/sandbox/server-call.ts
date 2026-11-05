import { type HTTPError, isHTTPError } from "@noverax/courier"

/** What a call made on the server came to: its data, or the refusal it was answered with. */
export type ServerAnswer<TData> =
  | { readonly data: TData; readonly error?: undefined; readonly status?: undefined }
  | { readonly data?: undefined; readonly error: string; readonly status: number }

/**
 * The message an API's refusal gave, as its body's `message`, or the
 * error's own when it gave none.
 *
 * @param failure - The refusal
 * @returns The message, to show
 * @example
 * ```ts
 * refusalMessage(failure) // "Too many calls from this visitor; try again in 12 s"
 * ```
 */
export function refusalMessage(failure: HTTPError): string {
  const data: unknown = failure.data
  if (typeof data === "object" && data !== null && "message" in data) {
    const { message } = data
    if (typeof message === "string") return message
  }
  return failure.message
}

/**
 * What a call made while a page renders on the server came to: its data,
 * or the refusal the API answered with — past the visitor's budget, say —
 * which the page shows in place of the data rather than failing with it.
 *
 * @param call - The call
 * @returns Its data, or the refusal's status and message
 * @throws Whatever the call failed with that is no answer of the API's
 * @example
 * ```ts
 * const users = await answerOf(caller.users.getAll())
 * ```
 */
export async function answerOf<TData>(call: Promise<TData>): Promise<ServerAnswer<TData>> {
  try {
    return { data: await call }
  } catch (failure) {
    if (!isHTTPError(failure)) throw failure
    return { error: refusalMessage(failure), status: failure.status }
  }
}

/**
 * What a Server Action tells the page its call failed with: the API's
 * refusal as it gave it, or, for a failure of another kind, which the log
 * keeps whole, what the action was doing.
 *
 * @param failure - What the call failed with
 * @param doing - What the action was doing, as the page reads it
 * @returns The message
 * @example
 * ```ts
 * return { error: actionFailure(failure, "Failed to create user.") }
 * ```
 */
export function actionFailure(failure: unknown, doing: string): string {
  if (isHTTPError(failure)) return refusalMessage(failure)
  console.error(doing, failure)
  return doing
}
