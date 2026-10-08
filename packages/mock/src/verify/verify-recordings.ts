import type { Fixture } from "../record/fixture";
import { checkRecording } from "./check-recording";
import { catalogOf, findEndpoint, LONE_SOURCE } from "./endpoint-catalog";
import type { RecordingCheck, VerifyOptions } from "./types";

/**
 * Check recorded calls against the API definition as it is now — the test
 * a session saved from Studio runs, and what `courier-studio verify` runs
 * in CI. Each call is checked for what would break it today: its endpoint
 * removed, its HTTP method or route changed, its recorded variables refused
 * by the variables schema, its recorded answer refused by the response
 * schema. Values replaced as secrets, and parts recorded only in part, are
 * left alone; nothing is sent anywhere.
 *
 * @param sources - The API, or the APIs by name — a config's `sources`
 * @param recordings - The recorded calls, as `harToFixtures` reads them
 * @param options - Endpoints to leave unchecked
 * @returns One check per recording, in order; a call that still fits has no problems
 * @example
 * ```ts
 * const checks = await verifyRecordings(config.sources, harToFixtures(har));
 * const broken = checks.filter((check) => check.problems.length > 0);
 * ```
 */
export async function verifyRecordings(
  sources: object,
  recordings: readonly Fixture[],
  options: VerifyOptions = {},
): Promise<RecordingCheck[]> {
  const catalog = catalogOf(sources);
  const ignored = ignoreRule(options.ignore ?? []);
  const checks: RecordingCheck[] = [];
  for (const [index, recording] of recordings.entries()) {
    const id = recording.group ? `${recording.group}.${recording.method}` : recording.method;
    const found = findEndpoint(catalog, recording.source, id);
    const source = "source" in found ? found.source : recording.source;
    const base = {
      at: index + 1,
      ...(source !== undefined && source !== LONE_SOURCE && { source }),
      endpoint: id,
      label: labelOf(recording, id, source),
      status: recording.response.status,
    };
    if (ignored(source, id)) {
      checks.push({ ...base, problems: [], unchecked: ["left unchecked by the ignore list"] });
    } else if ("missing" in found) {
      const problem = { kind: "endpoint-removed" as const, message: found.missing };
      checks.push({ ...base, problems: [problem], unchecked: [] });
    } else {
      checks.push({ ...base, ...(await checkRecording(recording, found.endpoint)) });
    }
  }
  return checks;
}

function labelOf(recording: Fixture, id: string, source: string | undefined): string {
  const named = source && source !== LONE_SOURCE ? `${source} ${id}` : id;
  const { request } = recording;
  if (!request || request.url.startsWith("courier:")) {
    return `${named} → ${recording.response.status}`;
  }
  return `${named} · ${request.method.toUpperCase()} ${pathOf(request.url)} → ${recording.response.status}`;
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url, "http://recorded.invalid/");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    /* An address that is not a URL is shown as recorded. */
    return url;
  }
}

/* `orders.get`, `admin.*`, `payments:charges.create`: a `*` stands for any part of a call. */
function ignoreRule(
  patterns: readonly string[],
): (source: string | undefined, id: string) => boolean {
  const rules = patterns.map((pattern) => {
    const scoped = pattern.includes(":");
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return { scoped, test: new RegExp(`^${escaped}$`) };
  });
  return (source, id) =>
    rules.some(({ scoped, test }) => test.test(scoped ? `${source ?? ""}:${id}` : id));
}
