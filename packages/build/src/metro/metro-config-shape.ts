/** Where Metro found a module: the part the routes resolver reads. */
export interface MetroResolution {
  readonly type: string;
  readonly filePath?: string | undefined;
}

/** What Metro hands a resolver: the part the routes resolver reads. */
export interface MetroResolutionContext {
  /** Whether the bundle is a development one: a build's fails where the routes were not read. */
  readonly dev: boolean;
  /** The module that imports the one resolved. */
  readonly originModulePath: string;
  /** Expo names a server's bundle here: `node`, or `react-server`. */
  readonly customResolverOptions?: { readonly environment?: unknown } | undefined;
  /** The resolver the chain goes on with: Metro's own, or the one Expo wraps it in. */
  readonly resolveRequest: MetroResolver;
}

/** A Metro resolver, as `resolver.resolveRequest` takes one. */
export type MetroResolver = (
  context: MetroResolutionContext,
  moduleName: string,
  platform: string | null,
) => MetroResolution;

/** What of a Metro config the plugin reads and extends: Expo's `getDefaultConfig()` gives one. */
export interface MetroConfigShape {
  readonly projectRoot?: string | undefined;
  readonly watchFolders?: readonly string[] | undefined;
  readonly resolver?: { readonly resolveRequest?: MetroResolver | null | undefined } | undefined;
}
