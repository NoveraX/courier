/**
 * The enterprise project the scale tests measure, as data: its sources,
 * their groups — some inside others — each group's records and endpoints,
 * and its streams and channels; every count exact for the size asked for.
 */
import { between, pick, seeded, some } from "./random.mjs";
import { ACTIONS, CHILDREN, ENTITIES } from "./words.mjs";

/** The sources of the company's APIs, and the share of the endpoints each holds. */
const SOURCES = [
  { name: "core", share: 0.3 },
  { name: "billing", share: 0.2 },
  { name: "catalog", share: 0.25 },
  { name: "identity", share: 0.15 },
  { name: "insights", share: 0.1 },
];
/** The parts a record may have beyond its id, name, status and times. */
const OPTIONAL_FIELDS = [
  "owner",
  "tags",
  "metadata",
  "amount",
  "address",
  "priority",
  "archived",
  "description",
  "parentId",
  "details",
];
const STREAMS_PER_SOURCE = 5;

/** @typedef {{ name: string, verb: "get" | "post" | "patch" | "del", path: string, shape: string, access: "read" | "write" | "destructive" }} Endpoint */
/** @typedef {{ name: string, entity: string, fields: string[], endpoints: Endpoint[], groups: Group[], child: boolean }} Group */
/** @typedef {{ name: string, groups: Group[], streams: string[], channels: string[], endpoints: number }} Source */

/** What each kind of endpoint is: its verb, its path, the shape of its call, and what it does to the data. */
const KINDS = {
  list: { verb: "get", path: "", shape: "list", access: "read" },
  get: { verb: "get", path: ":id", shape: "byId", access: "read" },
  create: { verb: "post", path: "", shape: "create", access: "write" },
  update: { verb: "patch", path: ":id", shape: "update", access: "write" },
  remove: { verb: "del", path: ":id", shape: "removed", access: "destructive" },
  archive: { verb: "post", path: ":id/archive", shape: "byId", access: "write" },
  restore: { verb: "post", path: ":id/restore", shape: "byId", access: "write" },
  search: { verb: "get", path: "search", shape: "search", access: "read" },
  export: { verb: "get", path: "export", shape: "export", access: "read" },
  duplicate: { verb: "post", path: ":id/duplicate", shape: "byId", access: "write" },
  history: { verb: "get", path: ":id/history", shape: "history", access: "read" },
  stats: { verb: "get", path: "stats", shape: "stats", access: "read" },
};
const CHILD_KINDS = ["childList", "childGet", "childCreate"];
const CHILD = {
  childList: { verb: "get", path: ":parentId/items", shape: "childList", access: "read" },
  childGet: { verb: "get", path: ":parentId/items/:id", shape: "childGet", access: "read" },
  childCreate: { verb: "post", path: ":parentId/items", shape: "childCreate", access: "write" },
};

/**
 * The enterprise project for a number of endpoints: the same project for the
 * same number and seed, every run.
 *
 * @param {{ endpoints?: number, seed?: number }} [options] - How many endpoints, and the seed
 * @returns {{ sources: Source[], endpoints: number }} The project's APIs
 * @example
 * ```js
 * const { sources } = enterpriseModel({ endpoints: 1000 });
 * ```
 */
export function enterpriseModel({ endpoints = 1000, seed = 1 } = {}) {
  const next = seeded(seed);
  const entities = names();
  let left = endpoints;
  const sources = SOURCES.map(({ name, share }, index) => {
    const budget = index === SOURCES.length - 1 ? left : Math.round(endpoints * share);
    left -= budget;
    return sourceOf(name, budget, entities, next);
  });
  return { sources, endpoints: sources.reduce((sum, source) => sum + source.endpoints, 0) };
}

/** @returns {Source} */
function sourceOf(name, budget, entities, next) {
  const streams = budget >= 20 ? STREAMS_PER_SOURCE : 0;
  const channels = budget >= 20 ? 1 : 0;
  let left = budget - streams - channels;
  const groups = [];
  while (left > 0) {
    const entity = entities.next().value;
    const group = groupOf(entity, entity, next, Math.min(left, 8), false);
    left -= group.endpoints.length;
    if (groups.length % 4 === 1 && left >= 3) {
      const child = groupOf(pick(next, CHILDREN), entity, next, 3, true);
      group.groups.push(child);
      left -= child.endpoints.length;
    }
    groups.push(group);
  }
  return {
    name,
    groups,
    streams: Array.from({ length: streams }, (_, at) => groups[at]?.entity ?? `feed${at}`),
    channels: channels ? ["chat"] : [],
    endpoints: budget,
  };
}

/* Every name once, then each again with a number: `accounts`, …, `accounts2`. */
function* names() {
  for (let round = 1; ; round++) {
    for (const entity of ENTITIES) yield round === 1 ? entity : `${entity}${round}`;
  }
}

/** @returns {Group} */
function groupOf(name, entity, next, most, child) {
  const kinds = child
    ? CHILD_KINDS
    : ["list", "get", "create", "update", "remove", ...some(next, ACTIONS, between(next, 0, 3))];
  const endpoints = kinds.slice(0, Math.max(1, most)).map((kind) => ({
    name: child ? kind.replace("child", "").toLowerCase() : kind,
    .../** @type {Omit<Endpoint, "name">} */ (child ? CHILD[kind] : KINDS[kind]),
  }));
  const fields = some(next, OPTIONAL_FIELDS, between(next, 3, 8));
  return { name, entity, fields, endpoints, groups: [], child };
}

/**
 * Every HTTP endpoint of the project, with where it is: its source and its
 * group's path.
 *
 * @param {{ sources: Source[] }} model - The project's APIs
 * @returns {{ source: string, path: string, group: Group, endpoint: Endpoint }[]} The endpoints
 * @example
 * ```js
 * httpEndpoints(enterpriseModel()).length; // the endpoints less the streams and channels
 * ```
 */
export function httpEndpoints(model) {
  const found = [];
  for (const source of model.sources) {
    const walk = (/** @type {Group} */ group, /** @type {string} */ path) => {
      for (const endpoint of group.endpoints)
        found.push({ source: source.name, path, group, endpoint });
      for (const child of group.groups) walk(child, `${path}.${child.name}`);
    };
    for (const group of source.groups) walk(group, group.name);
  }
  return found;
}
