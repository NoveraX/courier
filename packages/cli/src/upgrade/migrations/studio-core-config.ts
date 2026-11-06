import { moveModule } from "../codemod/move-module";
import type { Migration } from "../migration";

const FROM = "@noverax/courier-studio-core/config";
const TO = "@noverax/courier-build/config";
const MOCKS = "@noverax/courier-studio-core/mocks";

/* The names of 0.3's config entry that went to Studio's mocks entry rather than to the build's config. */
const TO_MOCKS: Readonly<Record<string, string>> = Object.fromEntries(
  [
    "findMocksFile",
    "MOCKS_BASENAMES",
    "loadCourierMocksFile",
    "readMocksExport",
    "LoadedCourierMocks",
  ].map((name) => [name, MOCKS]),
);

/**
 * 0.4.0: the config loader and its transform cache are
 * `@noverax/courier-build/config`, a package that needs nothing of
 * Studio's runtime, and the mocks file's loader is
 * `@noverax/courier-studio-core/mocks`. A file that now loads the config
 * from the build's package needs it listed beside Studio's runtime.
 */
export const STUDIO_CORE_CONFIG: Migration = {
  id: "0.4.0/studio-core-config",
  title: "loads the config from @noverax/courier-build/config",
  mentions: [FROM],
  migrate(file) {
    const edits = moveModule(file, { from: FROM, to: TO, elsewhere: TO_MOCKS });
    const needs = edits.some((edit) => edit.text.includes(TO));
    return {
      edits,
      findings: [],
      packages: needs
        ? [{ name: "@noverax/courier-build", beside: "@noverax/courier-studio-core" }]
        : [],
    };
  },
};
