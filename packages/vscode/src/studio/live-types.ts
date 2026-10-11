/** A request Studio recorded, as the Requests view lists it. */
export interface RecordedRequest {
  readonly id: string;
  readonly source: string;
  /** Its call in the client: `orders.place` */
  readonly endpoint: string;
  readonly method?: string | undefined;
  readonly mode: string;
  readonly state: "success" | "error" | "pending";
  readonly status?: number | undefined;
  readonly durationMs?: number | undefined;
  readonly startedAt: number;
  readonly error?: string | undefined;
}

/** A scenario of a mock: the answers it gives together. */
export interface MockScenario {
  readonly name: string;
  readonly description?: string | undefined;
}

/** A mock server Studio runs, as the Mocks view lists it. */
export interface StudioMock {
  readonly id: string;
  readonly name: string;
  readonly source?: string | undefined;
  readonly status: string;
  readonly url?: string | undefined;
  readonly scenarios: readonly MockScenario[];
  readonly activeScenario: string | null;
  /** The delay preset set on it: `none`, `4g`, `3g`, `satellite`, `custom` */
  readonly latency: string;
  /** The fault preset set on it: `none`, `degraded`, `unstable`, `down`, `custom` */
  readonly chaos: string;
}

/** What may be set on a mock's network, by Studio's presets. */
export interface MockConditions {
  readonly latency?: "none" | "4g" | "3g" | "satellite" | undefined;
  readonly chaos?: "stable" | "degraded" | "unstable" | "down" | undefined;
  readonly stop?: boolean | undefined;
}
