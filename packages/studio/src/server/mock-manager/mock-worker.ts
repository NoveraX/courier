/**
 * The process Studio forks for each managed mock server.
 *
 * It loads `courier.mocks.*` with the loader Studio itself uses, so a
 * TypeScript file that loads in Studio loads here too — extensionless imports
 * and tsconfig path aliases included — with nothing else to install. It
 * transforms the project's modules through `workerTransformCache`, reading
 * what Studio kept in the directory its start message names.
 */

import { runMockWorker } from "@noverax/courier-mock/managed";
import { loadCourierMocksFile } from "@noverax/courier-studio-core/config";
import { workerTransformCache } from "./worker-transform-cache";

runMockWorker(async (mocksFile, mockKey, transformCacheDirectory) => {
  const transformCache = workerTransformCache(transformCacheDirectory);
  const { mocks } = await loadCourierMocksFile(mocksFile, { transformCache });
  return Object.hasOwn(mocks, mockKey) ? mocks[mockKey] : undefined;
});
