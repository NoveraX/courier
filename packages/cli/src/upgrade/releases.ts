import type { Release } from "./migration";
import { REALTIME_ERRORS } from "./migrations/realtime-errors";
import { STUDIO_CORE_CONFIG } from "./migrations/studio-core-config";
import { SUBSCRIPTION_TYPE } from "./migrations/subscription-type";
import { compareVersions, parseVersion, releaseLine, type Version } from "./versions";

const DOCS = "https://courier.noverax.cloud/docs";
const UPGRADING = `${DOCS}/upgrading`;
const NOTES_0_4_0 = "https://github.com/NoveraX/courier/releases/tag/v0.4.0";

/** Courier's releases whose changes code written for the one before needs carried over, in order. */
export const RELEASES: readonly Release[] = [
  {
    version: "0.4.0",
    notes: [
      {
        title: "cancelPrevious is true or false, set on the reads it cancels",
        docs: `${DOCS}/advanced/abort#where-to-turn-it-on`,
      },
      {
        title: "@noverax/courier-studio-core/config is @noverax/courier-build/config",
        docs: NOTES_0_4_0,
      },
      {
        title: "defineGroup and defineApi take the expose mark as a type argument",
        docs: NOTES_0_4_0,
      },
      {
        title: "A config is looked for up to the top of the project, and only yours runs",
        docs: NOTES_0_4_0,
      },
      {
        title: "{name} in a path is a parameter, and a path writes no fragment",
        docs: NOTES_0_4_0,
      },
      {
        title: "Pages take their routes from Courier's plugin for the build",
        docs: `${DOCS}/proxy-mode/expose#the-routes`,
      },
    ],
    migrations: [STUDIO_CORE_CONFIG],
  },
  {
    version: "0.5.0",
    notes: [
      {
        title: "NetworkError, TimeoutError and AbortError in place of status 0 and 499",
        docs: `${UPGRADING}#call-errors`,
      },
      {
        title:
          "What a retry policy repeats, how long it waits; the query hooks leave retries to it",
        docs: `${UPGRADING}#retries`,
      },
      {
        title: "A header no request can carry is refused; no Authorization without a token",
        docs: `${UPGRADING}#headers`,
      },
      {
        title: "A server's connections, by selector, on every replica",
        docs: `${UPGRADING}#on-the-server`,
      },
      {
        title: "One Subscription object; a connection's state machine",
        docs: `${UPGRADING}#in-the-client`,
      },
      {
        title: "The realtime errors come from @noverax/courier/realtime",
        docs: `${UPGRADING}#realtime-errors`,
      },
      {
        title: "Protocol version 2: deploy the client and the server together",
        docs: `${UPGRADING}#protocol-version-2`,
      },
      {
        title: "Request bodies held to limits; uploads past 1 MB kept on disk",
        docs: `${UPGRADING}#request-bodies-and-uploads`,
      },
    ],
    migrations: [REALTIME_ERRORS, SUBSCRIPTION_TYPE],
  },
];

/**
 * The releases an upgrade crosses: those after the line the project is on
 * and up to the target's own.
 *
 * @param from - The version the project is on
 * @param to - The version it moves to
 * @param releases - Courier's releases, in order
 * @returns Those crossed, in order
 * @example
 * ```ts
 * releasesBetween(parseVersion("0.3.1")!, parseVersion("0.5.0")!).map((release) => release.version); // ["0.4.0", "0.5.0"]
 * ```
 */
export function releasesBetween(
  from: Version,
  to: Version,
  releases: readonly Release[] = RELEASES,
): Release[] {
  const fromLine = releaseLine(from);
  const toLine = releaseLine(to);
  return releases.filter((release) => {
    const version = parseVersion(release.version);
    return (
      version !== undefined &&
      compareVersions(version, fromLine) > 0 &&
      compareVersions(version, toLine) <= 0
    );
  });
}
