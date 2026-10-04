import type { ChartConfig } from "./chart-context";

// Helper to extract item config from a payload.
export function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
): ChartConfig[string] | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const payloadPayload =
    "payload" in payload && typeof payload.payload === "object" && payload.payload !== null
      ? payload.payload
      : undefined;

  const own: unknown = Reflect.get(payload, key);
  const nested: unknown = payloadPayload ? Reflect.get(payloadPayload, key) : undefined;
  const configLabelKey = typeof own === "string" ? own : typeof nested === "string" ? nested : key;

  return configLabelKey in config ? config[configLabelKey] : config[key];
}
