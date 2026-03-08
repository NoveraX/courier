type CacheEntry = {
  data: unknown;
  expiry: number;
};

const cache = new Map<string, CacheEntry>();

export const getCached = <T>(key: string): T | undefined => {
  const entry = cache.get(key);
  if (!entry) return undefined;

  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return undefined;
  }

  return entry.data as T;
};

export const setCache = (key: string, data: unknown, ttl: number): void => {
  cache.set(key, { data, expiry: Date.now() + ttl });
};
