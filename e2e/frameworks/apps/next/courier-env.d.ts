import type config from "./courier.config";

declare module "@noverax/courier/routes" {
  interface Register {
    config: typeof config;
  }
}
