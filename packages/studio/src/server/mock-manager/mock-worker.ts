/**
 * The process Studio forks for each managed mock server.
 *
 * It loads the config with the loader Studio itself uses, so a TypeScript
 * config that loads in Studio loads here too — extensionless imports and
 * tsconfig path aliases included — with nothing else to install.
 */

import { runMockWorker } from "@noverax/courier-mock/managed";
import { loadCourierConfigFile } from "@noverax/courier-studio-core/config";

runMockWorker(async (configFile, mockKey) => {
  const { config } = await loadCourierConfigFile(configFile);
  return config.mocks?.[mockKey];
});
