import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

const entry = {
  index: "src/index.ts",
};

export default defineConfig([
  {
    ...sharedBuild,
    entry,
    /* One JavaScript file per module, as the sources are: a page's bundler
       then takes the hooks it uses and drops the rest module by module —
       Turbopack keeps whatever module it reaches whole, so a page with the
       proxy's hooks would otherwise carry the direct caller's too. */
    unbundle: true,
    dts: false,
  },
  {
    ...sharedBuild,
    entry,
    dts: { ...sharedBuild.dts, emitDtsOnly: true },
  },
]);
