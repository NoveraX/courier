import { readFileSync } from "node:fs";

import { ownValue } from "../../apis/own-value";
import { messageOf } from "../../server/message-of";
import { isObject } from "../../server/validate-body";

/** The pull request a GitHub Actions job runs for, and what posting on it takes. */
export interface PullRequestTarget {
  /** The REST API's address: `https://api.github.com`, or a GitHub Enterprise Server's. */
  readonly api: string;
  /** `owner/repo`. */
  readonly repository: string;
  readonly number: number;
  readonly token: string;
}

/** The environment variables a job runs with. */
export type JobEnvironment = Readonly<Record<string, string | undefined>>;

const PUBLIC_API = "https://api.github.com";

/**
 * The pull request to post a report on, read from the environment GitHub
 * Actions gives a job: the repository, the API's address — a GitHub
 * Enterprise Server's when the job runs on one — the event the job runs
 * for, and the token the step is given. A job run for a pull request, or
 * for a comment on one, has one; any other job has none, and the reason
 * says why.
 *
 * @param env - The job's environment
 * @returns The pull request, or why there is none
 * @example
 * ```ts
 * const target = pullRequestOf(process.env);
 * if (typeof target === "string") log.warn(`Nothing posted: ${target}`);
 * ```
 */
export function pullRequestOf(env: JobEnvironment): PullRequestTarget | string {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) return "no token — pass the job's token to the step as GITHUB_TOKEN";
  const repository = env.GITHUB_REPOSITORY ?? "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    return "GITHUB_REPOSITORY names no repository — --comment posts from a GitHub Actions job";
  const number = eventNumber(env.GITHUB_EVENT_PATH);
  if (typeof number === "string") return number;
  return { api: (env.GITHUB_API_URL || PUBLIC_API).replace(/\/+$/, ""), repository, number, token };
}

/* The pull request's number in the event the job runs for, or why the event names none. */
function eventNumber(path: string | undefined): number | string {
  if (!path) return "GITHUB_EVENT_PATH is not set — --comment posts from a GitHub Actions job";
  let event: unknown;
  try {
    event = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return `the event file ${path} could not be read: ${messageOf(error)}`;
  }
  const request = field(event, "pull_request");
  const issue = field(event, "issue");
  const number =
    field(request, "number") ?? (field(issue, "pull_request") ? field(issue, "number") : undefined);
  if (typeof number === "number" && Number.isSafeInteger(number) && number > 0) return number;
  return "the job does not run for a pull request — run it on pull_request";
}

function field(value: unknown, key: string): unknown {
  return isObject(value) ? ownValue(value, key) : undefined;
}
