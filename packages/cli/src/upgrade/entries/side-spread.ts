/** What a side reached only through a guess came through first: a file or folder the graph could not read, or a package whose entry it could not follow. */
export type Guess = { readonly unread: number } | { readonly dir: string };

/** How far a side's spread reached each piece of code. */
export interface SideReach {
  /** 1 where the side may reach the piece. */
  readonly reached: Uint8Array;
  /** 1 where it reaches it along imports the graph read, from one of its roots. */
  readonly direct: Uint8Array;
  /** For a piece the side reaches only through a guess, the first one it came through. */
  readonly guessOf: (piece: number) => Guess | undefined;
  /** For a piece it reaches along imports the graph read, the root it reached it from first. */
  readonly rootOf: (piece: number) => number | undefined;
}

/** What a side's spread walks: its roots, the pieces each piece leads to, and what the graph could not read or follow. */
export interface SideWalk {
  readonly count: number;
  /** The pieces that are the side's roots. */
  readonly roots: readonly number[];
  /** The files and folders the graph could not read that may be the side's roots. */
  readonly unreadRoots: readonly number[];
  readonly next: (piece: number) => Iterable<number>;
  /** The files and folders the graph could not read that a piece may load, as this side loads them. */
  readonly unreadOf: (piece: number) => Iterable<number>;
  /** The packages a piece imports by name whose entry the graph could not follow: any of their pieces may be what it loads. */
  readonly packagesOf: (piece: number) => Iterable<string>;
  /** The packages whose code a file or folder the graph could not read may load. */
  readonly scopeOf: (unread: number) => Iterable<string>;
  readonly piecesOf: (dir: string) => Iterable<number>;
}

/* The guesses a walk meets, each once, in the order it meets them. */
class Guesses {
  readonly list: Guess[] = [];
  readonly #seen = new Set<string>();

  add(guess: Guess): void {
    const key = "unread" in guess ? `u${guess.unread}` : `d${guess.dir}`;
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    this.list.push(guess);
  }
}

/* What a walk keeps of each piece it reaches: the guess it came through, and the root it came from. */
interface Kept {
  readonly through: Int32Array;
  readonly from: Int32Array;
}

/* Every piece reached from the queue, each once, under the guess and from the root each came through, and each guess on the way. */
function walk(
  input: SideWalk,
  reached: Uint8Array,
  kept: Kept,
  queue: number[],
  guesses: Guesses,
): void {
  for (let at = 0; at < queue.length; at++) {
    const piece = queue[at] ?? 0;
    for (const unread of input.unreadOf(piece)) guesses.add({ unread });
    for (const dir of input.packagesOf(piece)) guesses.add({ dir });
    for (const to of input.next(piece))
      if (reached[to] === 0) {
        reached[to] = 1;
        kept.through[to] = kept.through[piece] ?? 0;
        kept.from[to] = kept.from[piece] ?? -1;
        queue.push(to);
      }
  }
}

/**
 * Where a side's code may reach: every piece along the imports from its
 * roots, and, where it reaches a file or folder the graph could not read
 * — or one of those is its root — every piece of the packages that
 * file's imports may lead to, or where it reaches a package by a name
 * whose entry the graph could not follow, every piece of that package,
 * and on from them. What is reached only through such a guess is told
 * apart, with the first guess it came through, and what is reached along
 * imports, with the root it came from first, as the roots are given.
 * Each package is taken in once, so the walk is linear in the graph.
 *
 * @param input - The side's roots and the graph
 * @returns How far it reached each piece
 * @example
 * ```ts
 * spreadSide({ count, roots: [0], unreadRoots: [], next, unreadOf, packagesOf, scopeOf, piecesOf }).reached[3]; // 1
 * ```
 */
export function spreadSide(input: SideWalk): SideReach {
  const direct = new Uint8Array(input.count);
  const kept = { through: new Int32Array(input.count), from: new Int32Array(input.count).fill(-1) };
  for (const root of input.roots) {
    direct[root] = 1;
    kept.from[root] = root;
  }
  const guesses = new Guesses();
  for (const unread of input.unreadRoots) guesses.add({ unread });
  walk(input, direct, kept, [...input.roots], guesses);
  const reached = direct.slice();
  const taken = new Set<string>();
  for (let at = 0; at < guesses.list.length; at++) {
    const guess = guesses.list[at] ?? { dir: "" };
    const queue: number[] = [];
    for (const dir of "dir" in guess ? [guess.dir] : input.scopeOf(guess.unread)) {
      if (taken.has(dir)) continue;
      taken.add(dir);
      for (const piece of input.piecesOf(dir))
        if (reached[piece] === 0) {
          reached[piece] = 1;
          kept.through[piece] = at + 1;
          queue.push(piece);
        }
    }
    walk(input, reached, kept, queue, guesses);
  }
  return {
    reached,
    direct,
    guessOf: (piece) => guesses.list[(kept.through[piece] ?? 0) - 1],
    rootOf: (piece) => {
      const root = kept.from[piece] ?? -1;
      return root === -1 ? undefined : root;
    },
  };
}
