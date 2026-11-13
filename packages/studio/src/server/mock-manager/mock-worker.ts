/**
 * The process Studio forks for each managed mock server.
 *
 * It loads `courier.mocks.*` with the loader Studio itself uses, so a
 * TypeScript file that loads in Studio loads here too — extensionless imports
 * and tsconfig path aliases included — with nothing else to install. It
 * transforms the project's modules through `workerTransformCache`, reading
 * what Studio kept in the directory its start message names. What it logs —
 * an error the project's code threw at start or in a handler — holds the
 * environment's values masked, as Studio's own lines do.
 */

import { redactAlso } from "@noverax/courier/internal";
import { withoutSecrets } from "@noverax/courier-build/config";
import { runMockWorker } from "@noverax/courier-mock/managed";
import { loadCourierMocksFile } from "@noverax/courier-studio-core/mocks";
import { workerTransformCache } from "./worker-transform-cache";

redactAlso((text) => withoutSecrets(text));
runMockWorker(async (mocksFile, mockKey, transformCacheDirectory) => {
  const transformCache = workerTransformCache(transformCacheDirectory);
  const { mocks } = await loadCourierMocksFile(mocksFile, { transformCache });
  return Object.hasOwn(mocks, mockKey) ? mocks[mockKey] : undefined;
});
