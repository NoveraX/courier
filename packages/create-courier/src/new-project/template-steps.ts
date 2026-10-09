/** A program of the new project's own, run once its packages are installed, and what it did, as the person is told. */
export interface TemplateStep {
  readonly bin: string;
  readonly args: readonly string[];
  readonly done: string;
}

/**
 * Astro's server adapter for Node: Courier's route renders on demand,
 * which an Astro build needs an adapter for, and Node's runs wherever
 * Node does — the person changes it for their host's with `astro add`.
 */
export const ASTRO_NODE_ADAPTER: TemplateStep = {
  bin: "astro",
  args: ["add", "node", "--yes"],
  done: "Added Node's server adapter, which the build needs for Courier's route: for your host's, run astro add with its name",
};
