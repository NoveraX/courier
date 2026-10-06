/** The most of a request body the mock reads: JSON, and a form or an upload. */
export interface BodyLimits {
  json: number;
  upload: number;
}

/** A Courier server's limits: 1 MB of JSON, 10 MB of form or upload. */
export const BODY_LIMITS: BodyLimits = { json: 1_048_576, upload: 10_485_760 };

/**
 * The limits a mock was given, each one left out a Courier server's.
 *
 * @param options - The mock's options
 * @returns Its limits
 * @example
 * ```ts
 * bodyLimitsOf({ maxUploadBytes: 50_000_000 }); // { json: 1_048_576, upload: 50_000_000 }
 * ```
 */
export function bodyLimitsOf(
  options: { maxBodyBytes?: number | undefined; maxUploadBytes?: number | undefined } | undefined,
): BodyLimits {
  return {
    json: options?.maxBodyBytes ?? BODY_LIMITS.json,
    upload: options?.maxUploadBytes ?? BODY_LIMITS.upload,
  };
}
