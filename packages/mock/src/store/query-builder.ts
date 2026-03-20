/** Predicate that tests a single record */
export type WherePredicate<TItem> = Partial<{
  [K in keyof TItem]: TItem[K] | ((value: TItem[K]) => boolean);
}>;

/** Query builder for filtering records */
export interface QueryBuilder<TItem> {
  where(predicate: WherePredicate<TItem>): QueryBuilder<TItem>;
  or(predicate: WherePredicate<TItem>): QueryBuilder<TItem>;
  /** Test if a record matches all accumulated predicates */
  test(item: TItem): boolean;
}

interface Clause<TItem> {
  predicate: WherePredicate<TItem>;
  mode: "and" | "or";
}

/** Create a query builder instance */
export function createQueryBuilder<TItem>(): QueryBuilder<TItem> {
  const clauses: Clause<TItem>[] = [];

  const builder: QueryBuilder<TItem> = {
    where(predicate) {
      clauses.push({ predicate, mode: "and" });
      return builder;
    },

    or(predicate) {
      clauses.push({ predicate, mode: "or" });
      return builder;
    },

    test(item) {
      if (clauses.length === 0) return true;
      return evaluateClauses(item, clauses);
    },
  };

  return builder;
}

/** Evaluate all clauses against a single record */
function evaluateClauses<TItem>(item: TItem, clauses: Clause<TItem>[]): boolean {
  // Group clauses: first clause starts a group, "or" starts a new group
  // Within a group, all clauses are AND'd. Groups are OR'd together.
  let currentGroupResult = true;

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    if (!clause) continue;

    const matches = matchesPredicate(item, clause.predicate);

    if (i === 0 || clause.mode === "and") {
      currentGroupResult = currentGroupResult && matches;
    } else {
      // "or" — if previous group passed, we're done
      if (currentGroupResult) return true;
      currentGroupResult = matches;
    }
  }

  return currentGroupResult;
}

/** Check if a record matches a where predicate */
function matchesPredicate<TItem>(item: TItem, predicate: WherePredicate<TItem>): boolean {
  for (const key of Object.keys(predicate) as Array<keyof TItem>) {
    const condition = predicate[key];
    const value = item[key];

    if (typeof condition === "function") {
      if (!(condition as (v: unknown) => boolean)(value)) return false;
    } else {
      if (value !== condition) return false;
    }
  }
  return true;
}
