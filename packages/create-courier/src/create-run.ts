/** What the command line asked for. */
export interface CreateRun {
  /** The project's folder, or the new project's to create. */
  dir?: string | undefined;
  framework?: string | undefined;
  /** The example API, with a page that calls it: `--no-example` sets Courier up without an API yet. */
  example?: boolean | undefined;
  openapi?: string | undefined;
  name?: string | undefined;
  studio?: boolean | undefined;
  mocks?: boolean | undefined;
  mcp?: boolean | undefined;
  /** Where pages take their routes from: `plugin` or `file`. */
  routes?: string | undefined;
  "package-manager"?: string | undefined;
  install?: boolean | undefined;
  yes?: boolean | undefined;
  /** Go ahead with `--yes` where git has changes not committed. */
  "allow-dirty"?: boolean | undefined;
  "dry-run"?: boolean | undefined;
  /** Set by the command itself once it has created the project, never by the command line. */
  fresh?: boolean | undefined;
}
