import { post } from "@/lib/api-client";
import type { ImportBody } from "./client-file-changes";

/**
 * Ask Studio what declaring a written import in courier.config would change.
 *
 * @param body - The import as written
 * @returns Studio's answer, read with `readConfigDeclare`
 * @example
 * ```ts
 * readConfigDeclare(await previewConfigDeclare(importBody(state)));
 * ```
 */
export function previewConfigDeclare(body: ImportBody): Promise<unknown> {
  return post("/api/apis/declare/preview", body);
}

/**
 * Ask Studio to make the change a preview showed.
 *
 * @param body - The import as written
 * @param baseHash - The preview's `baseHash`: Studio changes nothing once the config differs from it
 * @returns Studio's answer, read with `readConfigDeclare`
 * @example
 * ```ts
 * readConfigDeclare(await applyConfigDeclare(importBody(state), preview.baseHash));
 * ```
 */
export function applyConfigDeclare(body: ImportBody, baseHash: string): Promise<unknown> {
  return post("/api/apis/declare/apply", { ...body, baseHash });
}
