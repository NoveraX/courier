import { posix, win32 } from "node:path";

import { CONFIG_FILES, ICONS, MOCKS_FILES, STATE_FOLDER, VSICONS_FOLDER_ICON } from "./icon-files";
import { isRecord } from "./is-record";

/** vscode-icons' settings, and its command that applies them. */
export const VSICONS_FILES = "vsicons.associations.files";
export const VSICONS_FOLDERS = "vsicons.associations.folders";
export const VSICONS_FOLDER_PATH = "vsicons.customIconFolderPath";
export const VSICONS_APPLY = "vscode-icons.regenerateIcons";

/** An entry of vscode-icons' associations. */
export interface VsiconsEntry {
  readonly icon: string;
  readonly extensions: readonly string[];
  readonly filename?: boolean;
  readonly light?: boolean;
  readonly format: "svg";
}

/** Courier's entries, and its icons by the names vscode-icons reads them under: the folder's drawn as vscode-icons draws its folders. */
export const VSICONS_PLAN = {
  files: [
    { icon: "courier-config", extensions: CONFIG_FILES, filename: true, format: "svg" },
    { icon: "courier-mocks", extensions: MOCKS_FILES, filename: true, format: "svg" },
  ],
  /* `light`: vscode-icons shows the folder's light look while the editor's colour theme is light. */
  folders: [{ icon: "courier", extensions: [STATE_FOLDER], format: "svg", light: true }],
  copies: new Map<string, string>([
    [`${ICONS.config}.svg`, "file_type_courier-config.svg"],
    [`${ICONS.mocks}.svg`, "file_type_courier-mocks.svg"],
    [`${VSICONS_FOLDER_ICON}.svg`, "folder_type_courier.svg"],
    [`${VSICONS_FOLDER_ICON}-open.svg`, "folder_type_courier_opened.svg"],
    [`${VSICONS_FOLDER_ICON}-light.svg`, "folder_type_light_courier.svg"],
    [`${VSICONS_FOLDER_ICON}-light-open.svg`, "folder_type_light_courier_opened.svg"],
  ]),
} as const satisfies { files: VsiconsEntry[]; folders: VsiconsEntry[]; copies: unknown };

const OURS = new Set<string>(
  [...VSICONS_PLAN.files, ...VSICONS_PLAN.folders].map((each) => each.icon),
);

/**
 * An association list with Courier's entries in, after the user's own; an
 * older Courier's entries are replaced.
 *
 * @param current - The setting as the user has it
 * @param ours - Courier's entries
 * @returns The setting to write
 * @example
 * ```ts
 * withCourierEntries(settings.inspect(VSICONS_FILES)?.globalValue, VSICONS_PLAN.files);
 * ```
 */
export function withCourierEntries(current: unknown, ours: readonly VsiconsEntry[]): unknown[] {
  return [...(withoutCourierEntries(current) ?? []), ...ours];
}

/**
 * An association list with Courier's entries taken out, the user's own kept.
 *
 * @param current - The setting as the user has it
 * @returns The setting to write, `undefined` when nothing is left
 * @example
 * ```ts
 * withoutCourierEntries(settings.inspect(VSICONS_FOLDERS)?.globalValue);
 * ```
 */
export function withoutCourierEntries(current: unknown): unknown[] | undefined {
  const kept = Array.isArray(current) ? current.filter((entry) => !isCourierEntry(entry)) : [];
  return kept.length > 0 ? kept : undefined;
}

/**
 * Whether the user's settings hold one of Courier's entries.
 *
 * @param current - The setting as the user has it
 * @returns Whether Courier's entries are there
 * @example
 * ```ts
 * hasCourierEntries(settings.inspect(VSICONS_FILES)?.globalValue);
 * ```
 */
export function hasCourierEntries(current: unknown): boolean {
  return Array.isArray(current) && current.some(isCourierEntry);
}

function isCourierEntry(entry: unknown): boolean {
  return isRecord(entry) && typeof entry.icon === "string" && OURS.has(entry.icon);
}

/** What vscode-icons finds its custom icons' folder by. */
export interface VsiconsHome {
  /** `vsicons.customIconFolderPath`: the folder that holds `vsicons-custom-icons` */
  readonly setting: string;
  readonly workspaces: readonly string[];
  readonly appName: string;
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
}

/**
 * The folder vscode-icons reads custom icons from, found as it finds it:
 * under the folder `vsicons.customIconFolderPath` names — a relative one
 * from the first workspace folder — or else under the editor's user folder
 * for its build: Code, Code - Insiders, Code - OSS, or a portable install.
 *
 * @param home - What the folder is found by
 * @returns The `vsicons-custom-icons` folder
 * @example
 * ```ts
 * vsiconsFolder({ setting: "", workspaces: [], appName: "Visual Studio Code", platform: "darwin", env: {}, home: "/Users/me" });
 * // "/Users/me/Library/Application Support/Code/User/vsicons-custom-icons"
 * ```
 */
export function vsiconsFolder(home: VsiconsHome): string {
  /* Paths as the system the editor runs on writes them, whichever system works them out. */
  const { isAbsolute, join } = home.platform === "win32" ? win32 : posix;
  const setting = home.setting.trim();
  if (!setting) return join(userFolder(home), "vsicons-custom-icons");
  const base =
    isAbsolute(setting) || !home.workspaces[0] ? setting : join(home.workspaces[0], setting);
  return join(base, "vsicons-custom-icons");
}

function userFolder({ appName, platform, env, home }: VsiconsHome): string {
  const dev = /dev/i.test(appName);
  const build = env.VSCODE_PORTABLE
    ? "user-data"
    : /insiders/i.test(appName)
      ? "Code - Insiders"
      : !dev && /oss/i.test(appName)
        ? "Code - OSS"
        : dev
          ? "code-oss-dev"
          : "Code";
  const { join } = platform === "win32" ? win32 : posix;
  return join(env.VSCODE_PORTABLE ?? appData(platform, env, home), build, "User");
}

function appData(platform: NodeJS.Platform, env: VsiconsHome["env"], home: string): string {
  if (platform === "darwin") return posix.join(home, "Library", "Application Support");
  if (platform === "linux") return posix.join(home, ".config");
  if (platform === "win32") return env.APPDATA ?? win32.join(home, "AppData", "Roaming");
  return "/var/local";
}
