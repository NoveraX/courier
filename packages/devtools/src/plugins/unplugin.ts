import { createUnplugin } from "unplugin";
import { RESOLVED_ID, VIRTUAL_ID } from "./core/constants";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { DevToolsPluginOptions } from "./core/types";

export const nexusDevToolsUnplugin = createUnplugin((options?: DevToolsPluginOptions) => {
  const resolved = resolveOptions(options);

  return {
    name: "nexus-devtools",
    enforce: "pre" as const,

    resolveId(id: string) {
      if (!resolved.enabled) return undefined;
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return undefined;
    },

    load(id: string) {
      if (!resolved.enabled) return undefined;
      if (id === RESOLVED_ID) return generateConnectSnippet(resolved);
      return undefined;
    },
  };
});
