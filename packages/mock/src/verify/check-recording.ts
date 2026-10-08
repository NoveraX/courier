import type { PlacedEndpoint } from "@noverax/courier/internal";
import { absentAs } from "@noverax/courier/internal";

import type { Fixture } from "../record/fixture";
import { routeProblem } from "./route-check";
import { outsideRedacted, reshapes, schemaIssues } from "./schema-check";
import type { RecordingProblem } from "./types";

/** What checking a recording against its endpoint found. */
export interface Findings {
  problems: RecordingProblem[];
  unchecked: string[];
}

/**
 * Check one recording against its endpoint as the definition has it now:
 * the route it was sent to, the variables it was called with, and — for an
 * answer of 2xx — the answer. A part recorded only in part goes unchecked,
 * and a refusal at a place whose secret was replaced does not count.
 *
 * @param recording - The recorded call
 * @param endpoint - Its endpoint
 * @returns The problems, and what could not be checked
 * @example
 * ```ts
 * const { problems } = await checkRecording(recording, endpoint);
 * ```
 */
export async function checkRecording(
  recording: Fixture,
  endpoint: PlacedEndpoint,
): Promise<Findings> {
  const findings: Findings = { problems: [], unchecked: [] };
  if (endpoint.kind === "stream" || endpoint.kind === "channel") {
    findings.unchecked.push(`a ${endpoint.kind}'s recording is not checked`);
    return findings;
  }
  const route = routeProblem(endpoint, recording.request);
  if (route) findings.problems.push(route);
  await checkVariables(recording, endpoint, findings);
  await checkAnswer(recording, endpoint, findings);
  return findings;
}

async function checkVariables(
  recording: Fixture,
  endpoint: PlacedEndpoint,
  findings: Findings,
): Promise<void> {
  const schema = endpoint.schemas.variables;
  if (!schema) return;
  if (recording.partial?.includes("variables")) {
    findings.unchecked.push("the variables, recorded only in part");
    return;
  }
  /* A call made with no variables is checked as the client checks it: with what none means to the schema. */
  const variables = await absentAs(schema, recording.variables);
  const issues = outsideRedacted(
    await schemaIssues(schema, variables),
    "variables",
    recording.redacted,
  );
  if (issues.length === 0) return;
  findings.problems.push({
    kind: "variables-refused",
    message: "the recorded variables no longer pass the endpoint's variables schema",
    issues,
  });
}

async function checkAnswer(
  recording: Fixture,
  endpoint: PlacedEndpoint,
  findings: Findings,
): Promise<void> {
  const schema = endpoint.schemas.response;
  const { status, data } = recording.response;
  if (!schema || status < 200 || status > 299) return;
  if (recording.partial?.includes("response")) {
    findings.unchecked.push("the answer, recorded only in part");
    return;
  }
  const issues = outsideRedacted(await schemaIssues(schema, data), "response", recording.redacted);
  if (issues.length === 0) return;
  if (reshapes(schema)) {
    const where = issues.map((issue) => issue.path).join(", ");
    findings.unchecked.push(
      `the answer, refused at ${where} by a response schema that reshapes what it reads: the reshaping may be all that differs`,
    );
    return;
  }
  findings.problems.push({
    kind: "answer-refused",
    message: "the recorded answer no longer passes the endpoint's response schema",
    issues,
  });
}
