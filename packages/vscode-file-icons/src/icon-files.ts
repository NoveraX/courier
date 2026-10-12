const KINDS = ["ts", "mts", "cts", "js", "mjs", "cjs"] as const;

/** The names Courier's config takes, which its config icon marks. */
export const CONFIG_FILES: readonly string[] = KINDS.map((kind) => `courier.config.${kind}`);

/** The names Courier's mocks take, which its mocks icon marks. */
export const MOCKS_FILES: readonly string[] = KINDS.map((kind) => `courier.mocks.${kind}`);

/** The folder where Studio keeps a project's address, token and state. */
export const STATE_FOLDER = ".courier";

/** Courier's icons in `media/icons`, by their names without `.svg`; a folder's open look adds `-open`. */
export const ICONS = {
  config: "courier-config",
  mocks: "courier-mocks",
  folder: "folder-courier",
} as const;

/** The `.courier` folder's icon drawn as vscode-icons draws its folders; `-light` is its look in a light colour theme, `-open` the open folder's. */
export const VSICONS_FOLDER_ICON = "folder-courier-vsicons";

/** Courier's icon files for Material Icon Theme, as it ships them in `media/icons`. */
export const ICON_FILES: readonly string[] = [
  `${ICONS.config}.svg`,
  `${ICONS.mocks}.svg`,
  `${ICONS.folder}.svg`,
  `${ICONS.folder}-open.svg`,
];

/**
 * The folder in the editor's extensions folder that keeps Courier's icons
 * for Material Icon Theme whatever Courier's version, so the paths in the
 * settings never change; its dot keeps the editor from reading it as an
 * extension of its own.
 */
export const ICONS_HOME = ".noverax-courier-icons";

/** The icon themes that take Courier's icons, by the extension that makes each. */
export const ICON_THEMES = {
  material: {
    label: "Material Icon Theme",
    theme: "material-icon-theme",
    extension: "PKief.material-icon-theme",
  },
  vsicons: {
    label: "vscode-icons",
    theme: "vscode-icons",
    extension: "vscode-icons-team.vscode-icons",
  },
} as const;

/** An icon theme that takes Courier's icons. */
export type IconTheme = keyof typeof ICON_THEMES;

/** Courier's icons as this profile puts them in. */
export interface CourierIcons {
  /** Courier's `media/icons` folder */
  readonly dir: string;
  /** What tells this profile from the editor's others, which share the copies: its own id */
  readonly profile: string;
}

/** Every icon theme that takes Courier's icons. */
export const ICON_THEME_IDS: readonly IconTheme[] = ["material", "vsicons"];
