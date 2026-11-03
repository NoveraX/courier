/** What of the asset Parcel transforms the transformer reads and changes. */
export interface RoutesAsset {
  readonly filePath: string;
  readonly env: { isBrowser(): boolean };
  type: string;
  setCode(code: string): void;
  invalidateOnFileChange(filePath: string): void;
  invalidateOnFileCreate(
    invalidation: { readonly filePath: string } | { readonly glob: string },
  ): void;
  invalidateOnEnvChange(name: string): void;
  invalidateOnStartup(): void;
}

/** What of Parcel's options and logger the transformer reads, and its own options. */
export interface RoutesTransformContext {
  readonly options: { readonly mode: string };
  readonly logger: { warn(diagnostic: { readonly message: string }): void };
  /** The config, from the folder Parcel runs in or absolute, when it is not the one found. */
  readonly config?: string | undefined;
}
