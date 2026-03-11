export {
  parseRequestPayload,
  type RequestPayload,
  type RequestPayloadInput,
} from "./request-payload";
export { compileUrl, pathJoin, resolveBasePath } from "./url";

export const parseEndpointKey = (
  endpointKey: string,
): {
  group: string | undefined;
  method: string;
} => {
  const parts = endpointKey.split(":");
  const groupOrMethod = parts[0] ?? "";
  const method = parts[1];
  return {
    group: method ? groupOrMethod : undefined,
    method: method ?? groupOrMethod,
  };
};

export const headersToObject = (headers?: Headers): Record<string, string> | undefined => {
  if (!headers) return;
  return Object.fromEntries(headers.entries());
};

export const isFormData = (variables: unknown): variables is FormData =>
  typeof FormData !== "undefined" && variables instanceof FormData;

export const isHeaders = (variables: unknown): variables is Headers =>
  typeof Headers !== "undefined" && variables instanceof Headers;
