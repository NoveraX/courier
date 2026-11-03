/**
 * What of a loader's context the routes loader uses. webpack and Rspack give
 * all of it; Turbopack runs webpack loaders with a part of it, so what it may
 * lack is optional and used only where it is there.
 */
export interface RoutesLoaderContext {
  /** The module the loader runs on, absolute. */
  readonly resourcePath: string;
  /** `"production"` in a build, `"development"` under a dev server; Turbopack names none. */
  readonly mode?: string | undefined;
  /** The options the rule hands the loader. */
  getOptions(): unknown;
  /** Whether the loader's result may be kept for the same inputs: never for the routes. */
  cacheable(flag?: boolean): void;
  /** Mark the loader asynchronous; the callback ends it with an error or the module's code. */
  async(): (error: Error | null, content?: string) => void;
  /** Build the module again when this file changes. */
  addDependency(file: string): void;
  /** Build the module again when an entry of this folder is added or removed. */
  addContextDependency?(folder: string): void;
  /** Build the module again once this path, absent now, appears. */
  addMissingDependency?(path: string): void;
  /** Report an error while the module still builds: what a dev server shows over the page. */
  emitError?(error: Error): void;
}
