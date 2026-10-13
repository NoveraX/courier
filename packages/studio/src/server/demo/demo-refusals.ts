/**
 * What a visitor of a public demo is told when Studio does not do what
 * their page asked.
 */

/**
 * What the demo does not do for a visitor that Studio does only with the
 * token: write a file, keep a session, or read past what its pages show —
 * check an import for updates, preview a change to the project's files.
 * Those are for a project of one's own.
 */
export const DEMO_TOKEN_REFUSAL =
  "This is a shared demo, so Studio writes no files, keeps no sessions and reads no more of its project than its pages show here. " +
  "Run Studio in your own project to import APIs, check them for updates, generate mocks and save sessions.";

/** The requests, the mocks' logs and the view are the same for every visitor. */
export const DEMO_SHARED_REFUSAL =
  "Everyone in this demo sees the same requests, mock logs and view, " +
  "so Studio does not clear or switch them for the other visitors.";

/** A file of the project is the host's, read for no visitor. */
export const DEMO_FILE_REFUSAL =
  "This is a shared demo, so Studio reads no file of its own for a visitor. " +
  "Paste the specification, or give its public URL.";
