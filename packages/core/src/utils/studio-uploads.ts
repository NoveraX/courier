import { reportingUploads, uploadProgressOf } from "../studio/report-upload";
import type { StudioContext } from "./execute-studio";

/** The endpoint a call is for, as the call was made. */
interface CallNames {
  source: unknown;
  group: unknown;
  method: unknown;
}

/**
 * A call's options, with its upload progress reported to Studio too.
 *
 * A direct call measures its own upload, so Studio is told the progress under
 * the call's own request id, the one its `request:start` carries. Without
 * Studio, or without a progress callback, the options are returned as they are.
 *
 * @param options - The call's options
 * @param studio - Whether Studio listens, and the call's request id
 * @param call - The endpoint the call is for
 * @returns The options to run the call with
 * @example
 * ```ts
 * const callOptions = withStudioUploads(options, studio, { source, group, method });
 * ```
 */
export function withStudioUploads<TOptions extends object>(
  options: TOptions,
  studio: StudioContext,
  call: CallNames,
): TOptions {
  const onUploadProgress = uploadProgressOf(options);
  if (!studio.hasStudio || !onUploadProgress || !studio.dt.onUploadProgress) return options;
  return {
    ...options,
    onUploadProgress: reportingUploads(onUploadProgress, {
      requestId: studio.requestId,
      source: nameOf(call.source),
      group: nameOf(call.group),
      method: nameOf(call.method),
    }),
  };
}

function nameOf(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
