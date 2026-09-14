/** Only immutable, per-user/per-job scan results belong here, never live state. */
export function createSnapshotCache<T>(options = { ttlMs: 10 * 60_000, maxBytes: 16 * 1024 * 1024, maxEntries: 16 }) {
  const values = new Map<string, { value: T; until: number; bytes: number }>();
  const pending = new Map<string, Promise<T | null>>();
  let bytes = 0;
  function remove(key: string) { bytes -= values.get(key)?.bytes ?? 0; values.delete(key); }
  return async (key: string, load: () => Promise<T | null>): Promise<T | null> => {
    const now = Date.now();
    for (const [entryKey, entry] of values) if (entry.until <= now) remove(entryKey);
    const cached = values.get(key);
    if (cached) return structuredClone(cached.value);
    let work = pending.get(key);
    if (!work) {
      work = load().then(value => {
        if (value !== null) {
          const size = Buffer.byteLength(JSON.stringify(value));
          if (size <= options.maxBytes) {
            while (values.size && (values.size >= options.maxEntries || bytes + size > options.maxBytes)) remove(values.keys().next().value!);
            values.set(key, { value: structuredClone(value), until: Date.now() + options.ttlMs, bytes: size });
            bytes += size;
          }
        }
        return value;
      });
      pending.set(key, work);
    }
    try { return structuredClone(await work); }
    finally { if (pending.get(key) === work) pending.delete(key); }
  };
}
