/**
 * The process Studio reads a specification in, generates its code in, or
 * compares two in — one job a process, out of its server's own so that no
 * specification, however large, holds it up. Studio stops the process once
 * the job is done or has taken its budget of time or memory, and a process
 * that fails leaves Studio running. It greets Studio first with the version
 * of what it understands, so a script left from another build of Studio is
 * told apart at once.
 */

import { serveSpecJobs } from "./serve-spec-jobs";

serveSpecJobs();
