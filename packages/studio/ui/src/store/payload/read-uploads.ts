import { isPlainObject } from "@/socket/is-plain-object";
import type { UploadConditions } from "../mock-slice-network-types";
import { readList } from "./read-list";

const isText = (item: unknown): item is string => typeof item === "string";

/**
 * A mock's upload conditions from a socket event — its upload speed, size
 * limit and types of file, each left out when absent — or `undefined` when
 * any part has another shape.
 *
 * @param value - The field as the socket parsed it
 * @returns The conditions; `{}` for a mock that sets none
 * @example
 * ```ts
 * readUploads({ bandwidth: 1500, accept: ["image/*"] }); // → { bandwidth: 1500, accept: ["image/*"] }
 * readUploads({ maxBytes: "1 MB" }); // → undefined
 * ```
 */
export function readUploads(value: unknown): UploadConditions | undefined {
  if (!isPlainObject(value)) return undefined;
  const { bandwidth, maxBytes, accept } = value;
  if (bandwidth !== undefined && typeof bandwidth !== "number") return undefined;
  if (maxBytes !== undefined && typeof maxBytes !== "number") return undefined;
  const types = accept === undefined ? undefined : readList(accept, isText);
  if (accept !== undefined && types === undefined) return undefined;
  return {
    ...(typeof bandwidth === "number" && { bandwidth }),
    ...(typeof maxBytes === "number" && { maxBytes }),
    ...(types && { accept: types }),
  };
}
