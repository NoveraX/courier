/** What the command line asked for. */
export interface CreateRun {
  /** The project's folder, or the new project's to create. */
  dir?: string | undefined;
  framework?: string | undefined;
  openapi?: string | undefined;
  name?: string | undefined;
  studio?: boolean | undefined;
  mocks?: boolean | undefined;
  mcp?: boolean | undefined;
  "package-manager"?: string | undefined;
  install?: boolean | undefined;
  yes?: boolean | undefined;
  "dry-run"?: boolean | undefined;
  /** Set by the command itself once it has created the project, never by the command line. */
  fresh?: boolean | undefined;
}
