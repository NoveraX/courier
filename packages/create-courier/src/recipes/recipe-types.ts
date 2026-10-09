import type { PackageManager } from "../project/package-manager";
import type { Project } from "../project/read-project";

/** What the person asked the command to set up. */
export interface SetupChoices {
  /** Studio: its package, the app's connection to it in development, and a script that starts it. */
  readonly studio: boolean;
  /** The example API's mock, which Studio runs, so the app answers before it has a backend. */
  readonly mocks: boolean;
  /** The example API's reads offered to AI agents over MCP, and the editor's entry that starts the server. */
  readonly mcp: boolean;
  /** An OpenAPI, Swagger or Postman specification to import in place of the example API. */
  readonly openapi?: string | undefined;
  /** The imported API's name, when it is not to be taken from its specification. */
  readonly name?: string | undefined;
}

/** What a recipe reads to say what setting Courier up takes. */
export interface RecipeContext {
  readonly project: Project;
  readonly manager: PackageManager;
  readonly choices: SetupChoices;
  /** The extension the project's relative imports carry. */
  readonly extension: "" | ".js";
  /** The framework's version as installed, else the lowest its range allows. */
  readonly version: string | undefined;
  /** The ports Studio and the example's mock take: the defaults, or the next free ones. */
  readonly ports: { readonly studio: number; readonly mock: number };
  /** Whether this run created the project, so the setup may move what a new project starts with. */
  readonly fresh: boolean;
}

/** A file the setup adds. */
export interface RecipeFile {
  /** Relative to the project's root, `/`-separated. */
  readonly path: string;
  readonly content: string;
  /** What it is for, in a few words, for the plan. */
  readonly purpose: string;
}

/** A change the person makes in a file of theirs, which the command does not change. */
export interface ManualStep {
  readonly file: string;
  /** What to do, in a sentence. */
  readonly what: string;
  /** The lines to add. */
  readonly lines: readonly string[];
}

/**
 * A change to a file of the project's own — its build config, its routes —
 * that the command makes only where the file has the shape the change
 * expects; elsewhere the person makes it.
 */
export interface RecipeEdit {
  /** Relative to the project's root, `/`-separated. */
  readonly path: string;
  /** What it is for, in a few words, for the plan. */
  readonly purpose: string;
  /**
   * The file with the change made — the file itself where it holds the
   * change already — or `undefined` where its shape is not one the change
   * knows.
   */
  readonly change: (text: string) => string | undefined;
  /** What the person adds where the command cannot. */
  readonly manual: ManualStep;
}

/** A change to one of the project's own scripts, and why it is needed. */
export interface ScriptRewrite {
  readonly script: string;
  /** What the change does, in a few words, for the plan. */
  readonly why: string;
  /** The script's command with the change made; the command itself where it has it already. */
  readonly change: (command: string) => string;
}

/** Something the person runs once it is set up, and what it does; a note where nothing is run. */
export interface NextStep {
  readonly command: string;
  readonly what: string;
}

/** What setting Courier up in a project takes. */
export interface Recipe {
  readonly files: readonly RecipeFile[];
  readonly edits: readonly RecipeEdit[];
  readonly dependencies: readonly string[];
  readonly devDependencies: readonly string[];
  /** Scripts for package.json, added where the project has none of the name. */
  readonly scripts: Readonly<Record<string, string>>;
  /** Changes to scripts of the project's own. */
  readonly rewrites?: readonly ScriptRewrite[];
  readonly manual: readonly ManualStep[];
  /** What the person runs once it is set up. */
  readonly next: readonly NextStep[];
  /**
   * Programs of the project's that write the types its code reads — Astro's
   * `astro sync` — run once the packages are installed, before the added
   * files are checked.
   */
  readonly prepare?: ReadonlyArray<{ readonly bin: string; readonly args: readonly string[] }>;
}
