import type { SpecNode } from "./types";

/** One media type of a request body or a response, with its schema. */
export interface MediaSchema {
  mediaType: string;
  schema: SpecNode;
  /** The media type's `encoding` object, for a form */
  encoding?: SpecNode;
}

/**
 * The media type of a body or response worth describing it by: JSON when it
 * carries a schema, else the first media type that does.
 *
 * @param content - The `content` object of a request body or a response
 * @returns The media type, its schema and its encoding, or `undefined` when none carries a schema
 * @example
 * ```ts
 * firstSchemaIn({ "application/x-www-form-urlencoded": { schema } }); // → { mediaType: "application/x-www-form-urlencoded", schema }
 * ```
 */
export function firstSchemaIn(content: SpecNode | undefined): MediaSchema | undefined {
  if (!content || typeof content !== "object") return undefined;
  const preferred = content["application/json"];
  if (preferred?.schema) return { mediaType: "application/json", ...parts(preferred) };
  for (const [mediaType, media] of Object.entries(content)) {
    if (media?.schema) return { mediaType, ...parts(media) };
  }
  return undefined;
}

function parts(media: SpecNode): Omit<MediaSchema, "mediaType"> {
  return {
    schema: media.schema,
    ...(media.encoding && typeof media.encoding === "object" && { encoding: media.encoding }),
  };
}
