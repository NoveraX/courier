/**
 * A map that keeps its newest entries only: a demo that runs for hours
 * holds no more than it can show.
 */
export class BoundedMap<TKey, TValue> {
  readonly #entries = new Map<TKey, TValue>();

  constructor(readonly limit: number) {}

  /** Keep a value, as the newest entry, letting the oldest go past the limit. */
  set(key: TKey, value: TValue): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    for (const oldest of this.#entries.keys()) {
      if (this.#entries.size <= this.limit) break;
      this.#entries.delete(oldest);
    }
  }

  get(key: TKey): TValue | undefined {
    return this.#entries.get(key);
  }

  /** The values, oldest first. */
  values(): TValue[] {
    return [...this.#entries.values()];
  }
}
