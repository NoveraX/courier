import type { SchemaField } from "@noverax/courier-studio-core";
import type {
  ScannedEndpoint,
  ScannedGroup,
  ScannedSource,
  SourceSummary,
} from "@/features/apis/types";

import { isPlainObject } from "./is-plain-object";

const IMPORT_TYPES: ReadonlySet<unknown> = new Set(["url", "file", "raw"]);
const HTTP_METHODS: ReadonlySet<unknown> = new Set(["get", "post", "put", "patch", "delete"]);
const ENDPOINT_TYPES: ReadonlySet<unknown> = new Set(["query", "mutation", null]);
const STREAM_TRANSPORTS: ReadonlySet<unknown> = new Set(["sse", "ws"]);
const TRANSPORTS: ReadonlySet<string> = new Set(["http", "sse", "ws"]);

/**
 * Whether an entry of a `registry:updated` list is an import the UI can
 * show: its type, its spec and where its code goes.
 *
 * `options` are the generate options Studio wrote with the import. Only
 * their shape as a record is checked: an import written by another Studio
 * version may carry a different set of options.
 *
 * @param item - One entry of the list, as Socket.IO delivered it
 * @returns Whether it is a well-formed import summary
 *
 * @example
 * ```ts
 * sourcesListOf(data, isSourceSummary, "registry:updated");
 * ```
 */
export function isSourceSummary(item: unknown): item is SourceSummary {
  return (
    isPlainObject(item) &&
    typeof item.name === "string" &&
    typeof item.specUrl === "string" &&
    IMPORT_TYPES.has(item.importType) &&
    typeof item.outputDir === "string" &&
    isPlainObject(item.options)
  );
}

/**
 * Whether an entry of a `scan:sources` list is a source the UI can show,
 * down to each of its endpoints.
 *
 * @param item - One entry of the list, as Socket.IO delivered it
 * @returns Whether it is a well-formed scanned source
 *
 * @example
 * ```ts
 * sourcesListOf(data, isScannedSource, "scan:sources");
 * ```
 */
export function isScannedSource(item: unknown): item is ScannedSource {
  return (
    isPlainObject(item) &&
    typeof item.name === "string" &&
    typeof item.baseURL === "string" &&
    typeof item.filePath === "string" &&
    isListOf(item.groups, isScannedGroup) &&
    (item.inlineEndpoints === undefined || isListOf(item.inlineEndpoints, isScannedEndpoint)) &&
    typeof item.isImported === "boolean" &&
    typeof item.hasClient === "boolean" &&
    (item.proxyPath === undefined || isProxyPath(item.proxyPath))
  );
}

function isProxyPath(item: unknown): boolean {
  return (
    isPlainObject(item) &&
    Object.keys(item).every((key) => TRANSPORTS.has(key) && typeof item[key] === "string")
  );
}

function isListOf<TItem>(list: unknown, isItem: (item: unknown) => item is TItem): list is TItem[] {
  return Array.isArray(list) && list.every(isItem);
}

function isScannedGroup(item: unknown): item is ScannedGroup {
  return (
    isPlainObject(item) &&
    typeof item.name === "string" &&
    typeof item.prefix === "string" &&
    typeof item.filePath === "string" &&
    isListOf(item.endpoints, isScannedEndpoint)
  );
}

function isScannedEndpoint(item: unknown): item is ScannedEndpoint {
  if (!isPlainObject(item) || typeof item.name !== "string") return false;
  const { analysis } = item;
  return (
    isPlainObject(analysis) &&
    HTTP_METHODS.has(analysis.httpMethod) &&
    typeof analysis.path === "string" &&
    ENDPOINT_TYPES.has(analysis.type) &&
    typeof analysis.hasResponseType === "boolean" &&
    typeof analysis.hasVariablesType === "boolean" &&
    typeof analysis.hasValidation === "boolean" &&
    (analysis.transport === undefined || STREAM_TRANSPORTS.has(analysis.transport)) &&
    (analysis.middleware === undefined || isListOf(analysis.middleware, isString)) &&
    (analysis.variablesStub === undefined || isPlainObject(analysis.variablesStub)) &&
    (analysis.variablesFields === undefined || isListOf(analysis.variablesFields, isSchemaField)) &&
    (analysis.hasReceiveSchema === undefined || analysis.hasReceiveSchema === true) &&
    (analysis.served === undefined || analysis.served === true)
  );
}

function isSchemaField(item: unknown): item is SchemaField {
  return (
    isPlainObject(item) &&
    typeof item.path === "string" &&
    typeof item.type === "string" &&
    typeof item.required === "boolean"
  );
}

function isString(item: unknown): item is string {
  return typeof item === "string";
}
