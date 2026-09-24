/**
 * Registration of the mocks declared in `courier.mocks.ts`: turn each,
 * described from its definition, into a tracked `ServerState`, keep it in
 * step with edits, and track one that cannot run with the reason.
 */

import type { MockServerDescription } from "@noverax/courier-mock/managed";
import type { PortAssignerContext } from "./mock-ports";
import { createPortAssigner, declaredPortOf } from "./mock-ports";
import type { ServerState } from "./types";

/** Where a mock is declared. */
export interface MockLocation {
  mocksFile: string;
  /** Display path shown in the UI (e.g. `courier.mocks.ts:users`). */
  relativePath: string;
}

export interface RegistrationContext extends PortAssignerContext {
  /** Whether the mock's worker is alive. */
  isAlive: (serverId: string) => boolean;
  updateAndEmit: (serverId: string, patch: Partial<ServerState>) => void;
  emitServerState: (state: ServerState) => void;
}

export interface MockRegistration {
  registerDeclared: (
    key: string,
    location: MockLocation,
    description: MockServerDescription,
  ) => void;
  updateDeclared: (key: string, location: MockLocation, description: MockServerDescription) => void;
  /** Track a mock whose definition cannot be read; returns what is reported for it. */
  registerProblem: (
    key: string,
    location: MockLocation,
    definition: unknown,
    problem: string,
  ) => string;
}

export function createMockRegistration(ctx: RegistrationContext): MockRegistration {
  const { servers, updateAndEmit, emitServerState } = ctx;
  const assignPort = createPortAssigner(ctx);

  function described(description: MockServerDescription): Partial<ServerState> {
    return {
      autoStart: description.autoStart,
      routes: description.routes.map((r) => ({ ...r })),
      collections: description.collections.map((name) => ({ name, count: 0, records: [] })),
      scenarios: description.scenarios,
    };
  }

  function track(key: string, location: MockLocation, fields: Partial<ServerState>): void {
    const state: ServerState = {
      serverId: key,
      name: key,
      mockKey: key,
      ...location,
      configuredPort: 0,
      portDeclared: false,
      autoStart: false,
      status: "declared",
      origin: "studio",
      routes: [],
      collections: [],
      scenarios: [],
      activeScenario: null,
      ...fields,
    };
    servers.set(key, state);
    emitServerState(state);
  }

  function registerDeclared(
    key: string,
    location: MockLocation,
    description: MockServerDescription,
  ): void {
    if (servers.has(key)) return;
    track(key, location, { ...assignPort(description.port), ...described(description) });
  }

  /**
   * Bring a tracked mock in line with its edited definition. A reason it
   * could not run belonged to the definition before, so it goes.
   */
  function updateDeclared(
    key: string,
    location: MockLocation,
    description: MockServerDescription,
  ): void {
    const state = servers.get(key);
    if (!state) return;
    const settled = state.status === "crashed" && !ctx.isAlive(key);
    updateAndEmit(key, {
      ...location,
      ...assignPort(description.port, state),
      ...described(description),
      lastError: undefined,
      ...(settled ? { status: state.startedAt === undefined ? "declared" : "stopped" } : {}),
    });
  }

  /**
   * Track a mock whose definition cannot be read. One that is running keeps
   * serving the last definition that could, as a module does after an edit
   * that does not compile, and says why the new one is not applied.
   */
  function registerProblem(
    key: string,
    location: MockLocation,
    definition: unknown,
    problem: string,
  ): string {
    const state = servers.get(key);
    if (state && ctx.isAlive(key)) {
      const reported = `${problem} It keeps serving its last working definition.`;
      updateAndEmit(key, { lastError: reported });
      return reported;
    }
    if (state) updateAndEmit(key, { ...location, status: "crashed", lastError: problem });
    else {
      track(key, location, {
        ...assignPort(declaredPortOf(definition)),
        status: "crashed",
        lastError: problem,
      });
    }
    return problem;
  }

  return { registerDeclared, updateDeclared, registerProblem };
}
