/**
 * Whether a form holds a file named by where it is on the device rather
 * than by its bytes: React Native's `{ uri, name, type }`, or an
 * expo-file-system `File`. React Native's XMLHttpRequest reads such a file
 * from where it is; expo/fetch — which Expo makes the app's `fetch` —
 * refuses one, as an "Unsupported FormDataPart implementation".
 *
 * @param body - A request's body
 * @returns `true` for a form with such a file
 * @example
 * ```ts
 * const form = new FormData();
 * form.append("photo", { uri: "file:///photo.jpg", name: "photo.jpg", type: "image/jpeg" });
 * holdsDeviceFiles(form); // true
 * ```
 */
export function holdsDeviceFiles(body: unknown): boolean {
  if (typeof FormData === "undefined" || !(body instanceof FormData)) return false;
  /* React Native's own FormData lists no entries; its fetch reads such files itself. */
  if (typeof body.entries !== "function") return false;
  for (const [, value] of body.entries()) if (namesDeviceFile(value)) return true;
  return false;
}

function namesDeviceFile(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (typeof Blob !== "undefined" && value instanceof Blob) return false;
  return typeof Reflect.get(value, "uri") === "string";
}
