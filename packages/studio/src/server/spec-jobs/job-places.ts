import { availableParallelism } from "node:os";

import { createCapacity } from "../capacity";
import { StudioBusyError } from "../studio-busy-error";
import { createWaitingPlaces } from "../waiting-places";
import type { JobRun } from "./run-in-process";

/** How many jobs Studio runs at once for callers without the token: reads, code and comparisons together. */
export const VISITOR_JOBS = 2;

/**
 * How many jobs Studio runs at once for callers with the token: one for
 * each core its own thread does not need, up to four. Each may take its
 * budget's heap, and checking every import for updates asks for one each.
 */
export const TRUSTED_JOBS = Math.max(1, Math.min(4, availableParallelism() - 1));

/*
 * One count for the whole process, whichever Studio in it a caller reached:
 * the jobs' processes take this machine's memory and cores, which every
 * Studio in the process shares.
 */
const visitorJobs = createCapacity(VISITOR_JOBS);
const trustedJobs = createWaitingPlaces(TRUSTED_JOBS);

const BUSY = `Studio works on up to ${VISITOR_JOBS} specifications at once for pages without the project's token. Try again in a moment.`;

/**
 * Run a job in one of the places Studio keeps for its caller's kind: a
 * caller without the token is refused when every place for such callers is
 * taken, so that none of them waits on another; a caller with it waits its
 * turn. The place is held until the job's process has ended, its memory
 * freed — not only until the job answered — so no more processes than there
 * are places hold memory at once; the caller has its answer meanwhile.
 *
 * @param trusted - Whether the caller holds the project's token
 * @param signal - Aborted once the caller goes away: it leaves the line
 * @param run - Starts the job, once a place is free
 * @returns The job's reply
 * @throws {StudioBusyError} For a caller without the token, while every place for one is taken
 * @throws The signal's reason, when the caller goes away while it waits
 * @throws What starting the job throws, its place given back at once
 * @example
 * ```ts
 * const reply = await inJobPlace(trusted, signal, () => runInProcess(job, budget, signal));
 * ```
 */
export async function inJobPlace<TReply>(
  trusted: boolean,
  signal: AbortSignal | undefined,
  run: () => JobRun<TReply>,
): Promise<TReply> {
  const leave = await placeFor(trusted, signal);
  let started: JobRun<TReply>;
  try {
    started = run();
  } catch (error) {
    leave();
    throw error;
  }
  void started.exited.then(leave);
  return started.reply;
}

/* A place taken, and how to give it back. */
async function placeFor(trusted: boolean, signal: AbortSignal | undefined): Promise<() => void> {
  if (trusted) {
    await trustedJobs.enter(signal);
    return () => trustedJobs.leave();
  }
  if (!visitorJobs.take()) throw new StudioBusyError(BUSY);
  return () => visitorJobs.give();
}
