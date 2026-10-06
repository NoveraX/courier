import type { RouteNetworkOverride, UploadConditions } from "../types";

/**
 * Upload conditions as a Studio command or a kept config names them: a
 * speed and a size limit above 0, and a list of types. One that sets
 * nothing is none. A list of types is kept even empty, since a route's
 * empty list takes any type in place of the global one.
 *
 * @param value - The `uploads` the command names
 * @returns The conditions, or `undefined` for none
 * @example
 * ```ts
 * readUploads({ bandwidth: 1500, accept: ["image/*", " .pdf "] });
 * // → { bandwidth: 1500, accept: ["image/*", ".pdf"] }
 * readUploads({ bandwidth: 0 }); // → undefined
 * ```
 */
export function readUploads(value: unknown): UploadConditions | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const fields: ReadonlyMap<string, unknown> = new Map(Object.entries(value));
  const bandwidth = positive(fields.get("bandwidth"));
  const maxBytes = positive(fields.get("maxBytes"));
  const accept = fields.get("accept");
  const uploads: UploadConditions = {
    ...(bandwidth !== undefined && { bandwidth }),
    ...(maxBytes !== undefined && { maxBytes: Math.floor(maxBytes) }),
    ...(Array.isArray(accept) && { accept: typesOf(accept) }),
  };
  return Object.keys(uploads).length > 0 ? uploads : undefined;
}

/**
 * A route's own upload conditions as a command names them: its size limit
 * and its types. The upload speed is the mock's alone, so a route's is
 * passed over.
 *
 * @param value - The route override's `uploads`
 * @returns Its limit and types, or `undefined` for none
 * @example
 * ```ts
 * readRouteUploads({ maxBytes: 1_048_576, bandwidth: 512 }); // → { maxBytes: 1_048_576 }
 * ```
 */
export function readRouteUploads(value: unknown): RouteNetworkOverride["uploads"] {
  const uploads = readUploads(value);
  if (uploads?.maxBytes === undefined && uploads?.accept === undefined) return undefined;
  return {
    ...(uploads.maxBytes !== undefined && { maxBytes: uploads.maxBytes }),
    ...(uploads.accept !== undefined && { accept: uploads.accept }),
  };
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function typesOf(items: unknown[]): string[] {
  return items
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}
