import { post } from "@/lib/api-client";
import { isPlainObject } from "@/socket/is-plain-object";

/** The OpenAPI versions a document can be written in. */
export type OpenApiVersion = "3.1.0" | "3.2.0";

/** How to write a source as an OpenAPI document. */
export interface OpenApiExportRequest {
  source: string;
  openapi: OpenApiVersion;
  /** The document's title; the source's name when empty. */
  title: string;
  /** The API's version the document states; `0.0.0` when empty. */
  version: string;
}

/** An endpoint the document leaves out, and why: a channel has no place in OpenAPI. */
export interface LeftOutEndpoint {
  operation: string;
  reason: string;
}

/** A source written as an OpenAPI document. */
export interface OpenApiExport {
  /** The document as `courier-studio openapi` writes it. */
  text: string;
  fileName: string;
  operations: number;
  leftOut: LeftOutEndpoint[];
}

/**
 * Have Studio write a source as an OpenAPI document, from the definition it
 * runs — with the endpoints the document leaves out, and why.
 *
 * @param request - The source and how to write it
 * @returns The document, its file's name, how many operations it holds, and what it left out
 * @throws {StudioRequestError} When Studio could not write it, saying why
 * @example
 * ```ts
 * const { text, fileName } = await readOpenApiDocument({ source: "shop", openapi: "3.1.0", title: "", version: "" });
 * ```
 */
export async function readOpenApiDocument(request: OpenApiExportRequest): Promise<OpenApiExport> {
  const answer = await post<unknown>("/api/openapi/document", {
    source: request.source,
    openapi: request.openapi,
    ...(request.title.trim() && { title: request.title }),
    ...(request.version.trim() && { version: request.version }),
  });
  if (!isExport(answer)) throw new Error("Studio answered with something other than a document.");
  return answer;
}

function isExport(value: unknown): value is OpenApiExport {
  if (!isPlainObject(value)) return false;
  const { text, fileName, operations, leftOut } = value;
  return (
    typeof text === "string" &&
    typeof fileName === "string" &&
    typeof operations === "number" &&
    Array.isArray(leftOut) &&
    leftOut.every(
      (one: unknown) =>
        isPlainObject(one) && typeof one.operation === "string" && typeof one.reason === "string",
    )
  );
}
