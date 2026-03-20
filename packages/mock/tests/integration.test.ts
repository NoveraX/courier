import { describe, expect, it } from "vitest";
import { defineApi, defineGroup, endpoint } from "@noverax/nexus/define";
import { createMockClient } from "../src/create-mock-client";
import { defineFactory } from "../src/factory";
import { defineScenario } from "../src/scenario";

// ---------------------------------------------------------------------------
// Real Nexus API definition (same as a user would write)
// ---------------------------------------------------------------------------

interface User {
  id: string;
  name: string;
  role: "user" | "admin";
}

interface Post {
  id: string;
  title: string;
  authorId: string;
}

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get()),
    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
    create: endpoint<User, { name: string; role: "user" | "admin" }>()((http, vars) =>
      http.post("", vars),
    ),
  },
});

const posts = defineGroup({
  prefix: "posts",
  endpoints: {
    getAll: endpoint<Post[]>()((http) => http.get()),
    getByAuthor: endpoint<Post[], { authorId: string }>()((http, vars) =>
      http.get("", vars),
    ),
  },
});

const api = defineApi({
  baseURL: "https://api.example.com",
  groups: { users, posts },
});

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const userFactory = defineFactory<User>({
  defaults: () => ({ id: crypto.randomUUID(), name: "Alice", role: "user" }),
  traits: {
    admin: { role: "admin" },
  },
});

const postFactory = defineFactory<Post>({
  defaults: () => ({ id: crypto.randomUUID(), title: "Hello World", authorId: "1" }),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integration: createMockClient with real defineApi", () => {
  it("mocks a simple GET endpoint", async () => {
    const { client, mock } = createMockClient<typeof api>();

    const data = userFactory.buildList(3);
    mock("users", "getAll").resolves(data);

    const result = await client.users.getAll();
    expect(result).toEqual(data);
    expect(result).toHaveLength(3);
  });

  it("mocks endpoint with variables", async () => {
    const { client, mock } = createMockClient<typeof api>();

    mock("users", "getById").returns((ctx) => {
      const vars = ctx.variables as { id: string };
      return userFactory.build({ id: vars.id, name: `User ${vars.id}` });
    });

    const user = await client.users.getById({ id: "42" });
    expect(user.id).toBe("42");
    expect(user.name).toBe("User 42");
  });

  it("mocks multiple groups independently", async () => {
    const { client, mock } = createMockClient<typeof api>();

    mock("users", "getAll").resolves(userFactory.buildList(2));
    mock("posts", "getAll").resolves(postFactory.buildList(5));

    const allUsers = await client.users.getAll();
    const allPosts = await client.posts.getAll();

    expect(allUsers).toHaveLength(2);
    expect(allPosts).toHaveLength(5);
  });

  it("tracks full history across groups", async () => {
    const { client, mock, history } = createMockClient<typeof api>();

    mock("users", "getAll").resolves([]);
    mock("posts", "getAll").resolves([]);

    await client.users.getAll();
    await client.posts.getAll();
    await client.users.getAll();

    expect(history).toHaveLength(3);
    expect(history[0]?.group).toBe("users");
    expect(history[1]?.group).toBe("posts");
    expect(history[2]?.group).toBe("users");
  });

  it("applies scenario with factories", async () => {
    const seededUsers = userFactory.buildSequence(3, (i, base) => ({
      ...base,
      id: String(i + 1),
      name: `User ${i + 1}`,
    }));

    const happyPath = defineScenario<typeof api>("happy-path", (mock) => {
      mock("users", "getAll").resolves(seededUsers);
      mock("users", "getById").returns((ctx) => {
        const vars = ctx.variables as { id: string };
        const found = seededUsers.find((u) => u.id === vars.id);
        if (!found) throw new Error("Not found");
        return found;
      });
      mock("posts", "getAll").resolves([]);
    });

    const { client } = createMockClient<typeof api>({ scenario: happyPath });

    const users = await client.users.getAll();
    expect(users).toHaveLength(3);
    expect(users[0]?.name).toBe("User 1");

    const user = await client.users.getById({ id: "2" });
    expect(user.name).toBe("User 2");
  });

  it("WireMock-style auth flow with state transitions", async () => {
    const { client, mock } = createMockClient<typeof api>();

    // Unauthenticated state — users endpoint returns 401
    mock("users", "getAll").inState("Started").rejects(401);

    // Create endpoint transitions to "authenticated"
    mock("users", "create")
      .inState("Started")
      .returns((ctx) => {
        const vars = ctx.variables as { name: string; role: "user" | "admin" };
        return userFactory.build({ name: vars.name, role: vars.role });
      })
      .transitionTo("authenticated");

    // Authenticated state — users endpoint returns data
    mock("users", "getAll")
      .inState("authenticated")
      .resolves(userFactory.buildList(2));

    // Step 1: should fail (401)
    await expect(client.users.getAll()).rejects.toThrow();

    // Step 2: create user — triggers transition
    const created = await client.users.create({ name: "Bob", role: "admin" });
    expect(created.name).toBe("Bob");

    // Step 3: now authenticated — should succeed
    const users = await client.users.getAll();
    expect(users).toHaveLength(2);
  });

  it("sequence mock simulates progressive loading", async () => {
    const { client, mock } = createMockClient<typeof api>();

    mock("posts", "getAll").sequence([
      [],
      postFactory.buildList(1),
      postFactory.buildList(3),
    ]);

    expect(await client.posts.getAll()).toHaveLength(0);
    expect(await client.posts.getAll()).toHaveLength(1);
    expect(await client.posts.getAll()).toHaveLength(3);
    // Stays on last
    expect(await client.posts.getAll()).toHaveLength(3);
  });

  it("switch between scenarios at runtime", async () => {
    const happy = defineScenario<typeof api>("happy", (mock) => {
      mock("users", "getAll").resolves(userFactory.buildList(5));
    });

    const empty = defineScenario<typeof api>("empty", (mock) => {
      mock("users", "getAll").resolves([]);
    });

    const error = defineScenario<typeof api>("error", (mock) => {
      mock("users", "getAll").rejects(500);
    });

    const mc = createMockClient<typeof api>({ scenario: happy });

    expect(await mc.client.users.getAll()).toHaveLength(5);

    mc.applyScenario(empty);
    expect(await mc.client.users.getAll()).toHaveLength(0);

    mc.applyScenario(error);
    await expect(mc.client.users.getAll()).rejects.toThrow();
  });

  it("network simulation adds latency", async () => {
    const { client, mock, history } = createMockClient<typeof api>({
      network: { latency: { min: 30, max: 50, jitter: 0 } },
    });

    mock("users", "getAll").resolves([]);
    await client.users.getAll();

    expect(history[0]?.duration).toBeGreaterThanOrEqual(25);
  });
});
