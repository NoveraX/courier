/**
 * What a visitor of a public demo is told when Studio does not do what
 * their page asked.
 */

/** The demo writes no file and keeps no session: those are for a project of one's own. */
export const DEMO_WRITE_REFUSAL =
  "This is a shared demo, so Studio writes no files and keeps no sessions here. " +
  "Run Studio in your own project to import APIs, generate mocks and save sessions.";

/** The requests, the mocks' logs and the view are the same for every visitor. */
export const DEMO_SHARED_REFUSAL =
  "Everyone in this demo sees the same requests, mock logs and view, " +
  "so Studio does not clear or switch them for the other visitors.";
