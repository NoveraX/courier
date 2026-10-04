/** What the Welcome page's address says. */
export interface WelcomeSearch {
  /** The framework whose setup steps are shown */
  framework?: string;
  /** The setup was asked for, so the page stays though a runtime is attached */
  setup?: boolean;
}

/**
 * Read the Welcome page's search parameters, keeping only those of the
 * expected types.
 *
 * @param search - The address's search parameters
 * @returns The Welcome page's parameters
 * @example
 * ```ts
 * validateWelcomeSearch({ framework: "nextjs" }); // → { framework: "nextjs" }
 * ```
 */
export function validateWelcomeSearch(search: Record<string, unknown>): WelcomeSearch {
  const { framework, setup } = search;
  return {
    ...(typeof framework === "string" && { framework }),
    ...(setup === true && { setup: true }),
  };
}
