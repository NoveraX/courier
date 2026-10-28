/* Studio's mocks file, `courier.mocks.ts`: where a project keeps it, and the
   mocks it declares. The config itself loads through `@noverax/courier-build/config`. */
export { findMocksFile, MOCKS_BASENAMES } from "./find-mocks-file";
export { type LoadedCourierMocks, loadCourierMocksFile } from "./load-courier-mocks-file";
export { readMocksExport } from "./read-mocks-export";
