import { create } from "zustand";

import type { SchemaFixTarget } from "./schema-fix-preview";

/**
 * The endpoint whose schema fix is shown: the dialog is open while one is
 * named.
 */
export const useSchemaFixDialog = create<{ target: SchemaFixTarget | null }>(() => ({
  target: null,
}));

/**
 * Show the change that makes an endpoint's response schema take the
 * answers Studio saw, for a person to review and apply.
 *
 * @param target - The endpoint
 * @example
 * ```ts
 * openSchemaFix({ source: "shop", endpoint: "products.get" });
 * ```
 */
export function openSchemaFix(target: SchemaFixTarget): void {
  useSchemaFixDialog.setState({ target });
}
