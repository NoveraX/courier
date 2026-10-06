import type { BodyRefusal } from "./read-request-body";

/**
 * The refusal of raw bytes sent to a route whose path gives values of its
 * own — `PUT /files/:id` with a file as the whole body. Raw bytes name no
 * fields for the path's values to join, and a Courier client cannot send
 * them so; a form carries the file and the values both.
 */
export const RAW_BESIDE_PATH_VALUES: BodyRefusal = {
  error:
    "The request body is raw bytes, which have no fields to hold the values this route's path gives; send the file in a form",
  status: 400,
};
