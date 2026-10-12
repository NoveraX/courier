/* Loaded only by a release that names no plugins of its own, which would
   then publish nothing: stop it rather than let it pass. */
throw new Error(
  "@semantic-release/npm is not installed: Courier publishes with scripts/release.ts. " +
    "List the release's plugins in .releaserc.json.",
);
