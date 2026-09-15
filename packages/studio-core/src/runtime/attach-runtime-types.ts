/** Identifies the runtime kind reported in `runtime:hello` */
export type RuntimeKind = "browser" | "server";

/** Public handle returned by `attachRuntime` */
export interface RuntimeHandle {
  readonly runtimeId: string;
  readonly kind: RuntimeKind;
  /** Tear down the socket connection and stop draining announcements */
  detach(): void;
}
