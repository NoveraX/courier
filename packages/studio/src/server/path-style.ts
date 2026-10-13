/** How a platform spells a path, as a text that names one may write it. */
export interface PathStyle {
  /** Windows: a drive first, and `\` and `/` alike between folders. */
  readonly windows: boolean;
  /** Whether names that differ only in letter case name one file, as on Windows and on macOS by default. */
  readonly caseless: boolean;
}

/** The style of the platform Studio runs on. */
export const PLATFORM_STYLE: PathStyle = {
  windows: process.platform === "win32",
  caseless: process.platform === "win32" || process.platform === "darwin",
};
