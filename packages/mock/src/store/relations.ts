import type { Collection } from "./collection-types";
import { sameId } from "./same-id";

/** One-to-one or one-to-many relation config */
interface OneRelation {
  type: "one";
  target: Collection<Record<string, unknown>>;
  key: string;
}

interface ManyRelation {
  type: "many";
  target: Collection<Record<string, unknown>>;
  foreignKey: string;
}

export type Relation = OneRelation | ManyRelation;

/** Helpers passed to defineRelations callback */
interface RelationHelpers {
  one<TItem extends Record<string, unknown>>(
    target: Collection<TItem>,
    config: { key: string },
  ): OneRelation;
  many<TItem extends Record<string, unknown>>(
    target: Collection<TItem>,
    config: { foreignKey: string },
  ): ManyRelation;
}

/** Relation definitions for a collection */
export type RelationDefinitions = Record<string, Relation>;

/** Define relations for a collection */
export function defineRelations(
  _source: Collection<Record<string, unknown>>,
  definer: (helpers: RelationHelpers) => RelationDefinitions,
): RelationDefinitions {
  const helpers: RelationHelpers = {
    one(target, config) {
      return {
        type: "one",
        target: target as Collection<Record<string, unknown>>,
        key: config.key,
      };
    },
    many(target, config) {
      return {
        type: "many",
        target: target as Collection<Record<string, unknown>>,
        foreignKey: config.foreignKey,
      };
    },
  };

  return definer(helpers);
}

/** Resolve a "one" relation for a record */
export function resolveOne<TRecord extends Record<string, unknown>>(
  record: TRecord,
  relation: Relation,
): Record<string, unknown> | undefined {
  if (relation.type !== "one") return undefined;
  const foreignId = record[relation.key];
  if (typeof foreignId !== "string" && typeof foreignId !== "number") return undefined;
  return relation.target.getById(foreignId);
}

/**
 * Resolve a "many" relation for a record: the target's records whose foreign
 * key holds the record's id, matched as getById matches ids — `"1"` names
 * record 1.
 */
export function resolveMany<TRecord extends Record<string, unknown>>(
  record: TRecord,
  relation: Relation,
  idField = "id",
): Record<string, unknown>[] {
  if (relation.type !== "many") return [];
  const id = record[idField];
  const all = relation.target.getAll();
  return all.filter((item) => sameId(item[relation.foreignKey], id));
}
