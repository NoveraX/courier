/**
 * The `studio` block of `courier.config.ts`, read before the server binds.
 *
 * The rest of the config is loaded later, once the server is up, by
 * `initConfigDriven`. The address cannot wait for that: it decides what to
 * bind. A config that will not load is not this function's problem — it is
 * reported properly by the later load — so an unreadable one simply yields
 * no address and the defaults apply.
 */

/** What a project asks of Studio, when it asks at all. */
export interface StudioAddress {
  host?: string;
  port?: number;
  /** First port handed to a managed mock server that named none itself. */
  mockBasePort?: number;
}

export async function readStudioAddress(projectRoot: string): Promise<StudioAddress> {
  try {
    const { loadCourierConfig } = await import("@noverax/courier-studio-core/config");
    const loaded = await loadCourierConfig({ cwd: projectRoot, requireAtCwd: true });
    const studio = loaded?.config.studio;
    return { host: studio?.host, port: studio?.port, mockBasePort: studio?.mockBasePort };
  } catch {
    /* Reported where the config is loaded for real; here it only means the
       flags and the built-in defaults decide. */
    return {};
  }
}
