# @noverax/nexus <!-- omit in toc -->

This library is designed to create HTTP requests.

> @noverax/nexus is written in `typescript` and supports the [NextJS](https://nextjs.org/) library. Thanks to middleware, you can bypass **cors**.

- [Install](#install)
- [Usage](#usage)
  - [DataSourse](#datasourse)
    - [RequestClass API](#requestclass-api)
      - [baseURL](#baseurl)
      - [headers](#headers)
      - [defaultData](#defaultdata)
      - [defaultQueryParams](#defaultqueryparams)
      - [pathOptions](#pathoptions)
      - [bodyEncoder](#bodyencoder)
      - [...other](#other)
    - [RequestGroupClass API](#requestgroupclass-api)
      - [prefix](#prefix)
      - [pathOptions](#pathoptions-1)
  - [Create api route (optional)](#create-api-route-optional)
  - [Create request](#create-request)

## Install

```bash
npm install @noverax/nexus
```

or

```bash
yarn add @noverax/nexus
```

## Usage

### DataSourse

```ts
import { Method, Request, RequestGroup } from "@noverax/nexus/RequestClass";

type Response = {
  success: boolean;
};

class City extends RequestGroup {
  constructor() {
    super({
      prefix: "city",
    });
  }

  update: Method<Response, { custom: string }> = async ({ put }) => {
    return await put("/update");
  };
}

const groups = { city: new City() };

export class MyAPI extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: "https://myapi.com",
      groups,
    });
  }

  getUsers: Method<Response> = async ({ get }) => {
    return await get("/get-user");
  };

  getUser: Method<Response, { id: number }> = async ({ get }) => {
    return await get("/get-user/:id");
  };

  // the variables will be automatically passed to the query,
  // but you can still get them
  addUser: Method<Response, { name: string }> = async ({ post }, variables) => {
    return await post("/add-user");
  };
}

export default MyAPI;
```

#### RequestClass API

##### baseURL

- Type: `string`
- Default: `undefined`

Request URL

##### headers

- Type: `object`
- Default: `undefined`

Request headers

##### defaultData

- Type: `Record<string, any>`
- Default: `undefined`

Initial data (body or query params) that is added to each request

##### defaultQueryParams

- Type: `Record<string, any>`
- Default: `undefined`

Initial query params that is added to each request

##### pathOptions

- Type: `(request?: NextApiRequest | NextRequest | IncomingMessage) => Record<string, string | number | boolean | null | undefined>`
- Default: `undefined`

Parameters for generating the url path

```ts

/**
 *
 * pathOptions: () => {
 *  return {
 *    id: 1009
 *  }
 * }
 *
*/

async updateUser({ put }) {
  return await put("/:id/update"); // -> https://myapi.com/1009/update
}

```

##### bodyEncoder

- Type: `(object: Record<string, any>) => BodyInit`
- Default: `undefined`

Request body encoder

```ts
import qs from "qs";

export class MyAPI extends Request<typeof groups> {
  constructor() {
    super({
      ...,

      bodyEncoder: qs.stringify,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },

      ...
    });
  }

  addUser: Method<Response, { name: string }> = async ({ post }) => {
    return await post("/add-user");
  };
}

```

##### ...other

All other ky options

#### RequestGroupClass API

##### prefix

- Type: `string`
- Default: `undefined`

You can specify a prefix that will be inserted at the beginning of each request of this group

```ts

// without prefix "city"
update: Method<Response> = async ({ put }) => {
  return await put("/update"); // -> https://myapi.com/update
};

// with prefix "city"
update: Method<Response> = async ({ put }) => {
  return await put("/update"); // -> https://myapi.com/city/update
};

```

##### pathOptions

- Type: `(request?: NextApiRequest | NextRequest | IncomingMessage) => Record<string, string | number | boolean | null | undefined>`
- Default: `undefined`

Parameters for generating the url path

```ts

/**
 *
 * pathOptions: () => {
 *  return {
 *    id: 1009
 *  }
 * }
 *
*/

async updateUser({ put }) {
  return await put("/:id/update"); // -> https://myapi.com/1009/update
}

```

### Create api route (optional)

If you are using [NextJS](https://nextjs.org/) it is recommended to use middleware.
Create new file `app/api/request/route.js`. You can change the page name by `REQUEST_PAGE` environment variable.

```ts
import apiRoute from "@noverax/nexus/next/apiRoute";
import { methods } from "@methods";

type Methods = typeof methods;

type MethodsType = {
  [K in keyof Methods]: Methods[K];
};

export const { POST } = apiRoute(methods);

declare module "@noverax/nexus" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface QueryOverrides extends MethodsType {}
}
```

### Create request

#### Using NestJS middleware <!-- omit in toc -->

##### From @noverax/nexus <!-- omit in toc -->

```js
import request from "@noverax/nexus";

const users = await request("myApi")("getUser");
const response = await request("myApi")("addUser", { name: "Jhon", age: 23 });

// if you used groups, then the format looks like "group:method"
const cityResponse = await request("myApi")("city:update");
```

#### Using direct request <!-- omit in toc -->

```js
import setup from "@noverax/nexus/direct";

import MyAPI from "./datasourse/MyAPI";

const myApi = new MyAPI();

const directRequest = setup({ myApi });

const users = await directRequest("myApi")("getUser");
const response = await directRequest("myApi")("addUser", {
  name: "Jhon",
  age: 23,
});

// if you used groups, then the format looks like "group:method"
const cityResponse = await directRequest("myApi")("city:update");
```
