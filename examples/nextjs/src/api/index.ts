import { Request } from "@noverax/nexus/RequestClass";
import { Files } from "./files";
import { Misc } from "./misc";
import { Posts } from "./posts";
import { Users } from "./users";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

const groups = {
  users: new Users(),
  posts: new Posts(),
  files: new Files(),
  misc: new Misc(),
};

class MockApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: API_URL,
      groups,
    });
  }
}

const mockApi = new MockApi();

export const methods = {
  mockApi,
};

type Methods = typeof methods;

export type MethodsType = {
  [K in keyof Methods]: Methods[K];
};
