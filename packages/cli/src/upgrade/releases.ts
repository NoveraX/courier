import type { Release } from "./migration";
import { CALL_ERROR_FINDINGS } from "./migrations/call-error-findings";
import { CANCEL_PREVIOUS_LIST } from "./migrations/cancel-previous-list";
import { HTTP_ERROR_STATUS_ZERO } from "./migrations/http-error-status-zero";
import { HTTP_PROBE_TYPE } from "./migrations/http-probe-type";
import { IMPORT_CREDENTIALS } from "./migrations/import-credentials";
import { PIN_HASH } from "./migrations/pin-hash";
import { REALTIME_ERRORS } from "./migrations/realtime-errors";
import { REALTIME_FINDINGS } from "./migrations/realtime-findings";
import { RETRY_ON_ZERO } from "./migrations/retry-on-zero";
import { SEND_AUTH_REQUIRED } from "./migrations/send-auth-required";
import { STUDIO_CORE_CONFIG } from "./migrations/studio-core-config";
import { SUBSCRIPTION_TYPE } from "./migrations/subscription-type";
import { VARIABLE_NOT_ENCODABLE } from "./migrations/variable-not-encodable";
import { VIA_KIND } from "./migrations/via-kind";
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
    migrations: [STUDIO_CORE_CONFIG, CANCEL_PREVIOUS_LIST],
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
      {
        title:
          "A record that holds a file is sent as a form: deploy the client and the server together",
        docs: `${UPGRADING}#variables`,
      },
      {
        title: "A .via() endpoint reads or writes as the verb its closure calls",
        docs: `${UPGRADING}#endpoints-addressed-with-via`,
      },
      {
        title:
          "A page imports from @noverax/courier/client, a server from /server; a server checks an API's session",
        docs: `${UPGRADING}#a-pages-imports-and-a-servers`,
      },
      {
        title: "create-courier needs Node.js 22.13; --yes changes no project git has not committed",
        docs: `${UPGRADING}#create-courier-and-courier-cli`,
      },
      {
        title:
          "Studio reads no credentials in an import's address; a file in a specification hashes anew",
        docs: `${UPGRADING}#studio-imports`,
      },
      {
        title:
          "Courier File Icons goes in as the editor starts, and carries courier.fileIcons.offer over itself",
        docs: `${UPGRADING}#courier-file-icons`,
      },
    ],
    migrations: [
      REALTIME_ERRORS,
      SUBSCRIPTION_TYPE,
      SEND_AUTH_REQUIRED,
      RETRY_ON_ZERO,
      HTTP_ERROR_STATUS_ZERO,
      CALL_ERROR_FINDINGS,
      REALTIME_FINDINGS,
      VARIABLE_NOT_ENCODABLE,
      VIA_KIND,
      HTTP_PROBE_TYPE,
      PIN_HASH,
      IMPORT_CREDENTIALS,
    ],
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
