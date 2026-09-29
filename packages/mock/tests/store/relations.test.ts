import { describe, expect, it } from "vitest";

import { createCollection } from "../../src/store/collection";
import { defineRelations, resolveMany, resolveOne } from "../../src/store/relations";

function blog() {
  const users = createCollection<{ id: number; name: string }>();
  users.seed([{ id: 1, name: "Ada" }]);
  const posts = createCollection<{ id: number; userId: number | string; title: string }>();
  posts.seed([
    { id: 10, userId: 1, title: "numbered" },
    { id: 11, userId: "1", title: "from a form" },
    { id: 12, userId: 2, title: "someone else's" },
  ]);
  return { users, posts };
}

describe("resolving relations", () => {
  it("finds the related records whose key holds the same id as a string", () => {
    const { users, posts } = blog();
    const relations = defineRelations(users, ({ many }) => ({
      posts: many(posts, { foreignKey: "userId" }),
    }));
    const ada = users.getById(1);
    if (!ada || !relations.posts) throw new Error("fixture is incomplete");

    const titles = resolveMany(ada, relations.posts).map((post) => post.title);

    expect(titles).toEqual(["numbered", "from a form"]);
  });

  it("finds the one related record a string key names", () => {
    const { users, posts } = blog();
    const relations = defineRelations(posts, ({ one }) => ({
      author: one(users, { key: "userId" }),
    }));
    const post = posts.getById(11);
    if (!post || !relations.author) throw new Error("fixture is incomplete");

    expect(resolveOne(post, relations.author)).toEqual({ id: 1, name: "Ada" });
  });

  it("finds no related record when the key holds no id", () => {
    const { users } = blog();
    const relations = defineRelations(users, ({ one }) => ({
      author: one(users, { key: "authorId" }),
    }));
    if (!relations.author) throw new Error("fixture is incomplete");

    expect(resolveOne({ id: 5 }, relations.author)).toBeUndefined();
  });
});
