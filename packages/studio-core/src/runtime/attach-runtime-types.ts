import type { CourierConfig } from "@noverax/courier/config";

/** Identifies the runtime kind reported in `runtime:hello` */
export type RuntimeKind = "browser" | "server";

/** Public handle returned by `attachRuntime` */
export interface RuntimeHandle {
  readonly runtimeId: string;
  readonly kind: RuntimeKind;
  /**
   * The courier.config a server runtime loaded, as it stands after the last
   * reload: `undefined` in a browser, or when no config loaded.
   */
  config(): CourierConfig | undefined;
  /** Tear down the socket connection and stop draining announcements */
  detach(): void;
}
