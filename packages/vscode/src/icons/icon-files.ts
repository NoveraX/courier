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

/** Every icon theme that takes Courier's icons. */
export const ICON_THEME_IDS: readonly IconTheme[] = ["material", "vsicons"];
