import type { AnyDefinedApi } from "@noverax/courier/define";

import { callAndCapture, fixtureOf } from "../record/capture-call";
import { readFixtureFile, writeFixtureFile } from "../record/fixture-file";
import { findFixture } from "../record/match-fixture";
import { createRecordingTransport } from "../record/recording-transport";
import type { Elsewhere } from "../server/elsewhere";
import { returnedHeaders } from "../server/forwarded-headers";
import { MockEndpointsError } from "./mock-endpoints-error";
import type { RouteInfo } from "./route-types";

/** What {@link createElsewhere} reads. */
export interface ElsewhereConfig {
  /** The API the mock serves, whose own server it calls. */
  source: AnyDefinedApi;
  routes: readonly RouteInfo[];
  /** The source's groups; an endpoint outside them is named by its method alone. */
  groupNames: ReadonlySet<string>;
  /** The endpoints the mock answers, by name; absent, it answers every one. */
  endpoints?: readonly string[] | undefined;
  /** The HAR file it records answers to and replays them from; absent, it generates them. */
  fixturesFile?: string | undefined;
}

/**
 * The calls a mock does not answer itself. An HTTP endpoint it does not
 * name goes to the source's own server, as the app calls it. With a
 * recordings file, a call it has an answer to is answered with it, and one
 * it has none to goes to the server once, whose answer is written to the
 * file. A stream or a channel the mock always answers itself.
 *
 * @param config - The source, its routes and groups, and what the mock answers itself
 * @returns The calls it leaves elsewhere; `undefined` when it answers every call itself
 * @throws {MockEndpointsError} When it names an endpoint the source does not have
 * @throws {FixtureFileError} When the recordings file is not one
 * @example
 * ```ts
 * const elsewhere = createElsewhere({ source, routes, groupNames, endpoints: ["orders.refund"] });
 * elsewhere?.passes("orders", "list"); // → true
 * ```
 */
export function createElsewhere(config: ElsewhereConfig): Elsewhere | undefined {
  const { routes, groupNames, fixturesFile: file } = config;
  if (config.endpoints === undefined && file === undefined) return undefined;
  const nameOf = (group: string, method: string): string =>
    groupNames.has(group) ? `${group}.${method}` : method;
  const streaming = new Set(
    routes
      .filter((r) => r.transport && r.transport !== "http")
      .map((r) => nameOf(r.group, r.endpoint)),
  );
  const answered =
    config.endpoints &&
    checked(
      config.endpoints,
      routes.map((r) => nameOf(r.group, r.endpoint)),
    );
  const transport = createRecordingTransport({ source: config.source });
  const known = file ? readFixtureFile(file) : [];
  /* An endpoint outside the groups is filed under a collection for the store, but called without one. */
  const wire = (group: string): string => (groupNames.has(group) ? group : "");
  return {
    passes: (group, method) =>
      answered !== undefined &&
      !streaming.has(nameOf(group, method)) &&
      !answered.has(nameOf(group, method)),
    replays: (group, method) => file !== undefined && !streaming.has(nameOf(group, method)),
    recorded(group, method, variables) {
      const fixture = findFixture(known, wire(group), method, variables);
      return fixture && { ...fixture.response, from: "recording" };
    },
    async ask({ group, method, variables, headers, record }) {
      const call = { group: wire(group), method, variables };
      const captured = await callAndCapture(transport, call, { headers });
      /* A call the server never answered fails with no status: nothing to answer with, or to record. */
      if (captured.status === 0) throw captured.error ?? new Error("the server did not answer");
      if (record && file) {
        known.push(fixtureOf(transport, call, captured));
        writeFixtureFile(file, known);
      }
      const { status, data } = captured;
      return { status, headers: returnedHeaders(captured.headers), data, from: "upstream" };
    },
  };
}

function checked(endpoints: readonly string[], names: readonly string[]): ReadonlySet<string> {
  const known = new Set(names);
  const unknown = endpoints.filter((name) => !known.has(name));
  if (unknown.length > 0) throw new MockEndpointsError(unknown, [...known]);
  return new Set(endpoints);
}
