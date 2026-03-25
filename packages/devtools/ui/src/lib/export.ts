/** Trigger a browser download from a string or Blob */
export function downloadFile(
  content: string | Blob,
  filename: string,
  mimeType = "application/json",
): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Serialize data as JSON and trigger download */
export function exportAsJson(data: unknown, filename: string): void {
  downloadFile(JSON.stringify(data, null, 2), filename, "application/json");
}
