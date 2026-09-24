/**
 * The process Studio forks for each managed mock server.
 *
 * It loads `courier.mocks.*` with the loader Studio itself uses, so a
 * TypeScript file that loads in Studio loads here too — extensionless imports
 * and tsconfig path aliases included — with nothing else to install.
 */

import { runMockWorker } from "@noverax/courier-mock/managed";
import { loadCourierMocksFile } from "@noverax/courier-studio-core/config";

runMockWorker(async (mocksFile, mockKey) => {
  const { mocks } = await loadCourierMocksFile(mocksFile);
  return Object.hasOwn(mocks, mockKey) ? mocks[mockKey] : undefined;
});
