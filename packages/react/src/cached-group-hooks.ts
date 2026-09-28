/**
 * Hand out one set of hooks per group, made the first time the group is read.
 *
 * Reading `q.users` twice gives the same object, so hooks taken from it keep
 * their identity between renders.
 *
 * @param make - Builds the hooks of one group
 * @returns The hooks of a group, by name
 * @example
 * const hooksOf = cachedGroupHooks((group) => createGroupHooks("api", group, http, sse, ws));
 * hooksOf("users") === hooksOf("users"); // → true
 */
export function cachedGroupHooks<THooks extends object>(
  make: (group: string) => THooks,
): (group: string) => THooks {
  const made = new Map<string, THooks>();
  return (group) => {
    let hooks = made.get(group);
    if (hooks === undefined) {
      hooks = make(group);
      made.set(group, hooks);
    }
    return hooks;
  };
}
