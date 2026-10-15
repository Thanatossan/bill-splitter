import { Redis } from "@upstash/redis";
import { promises as fs } from "fs";
import path from "path";
import type { Bill, Person } from "./types";

/**
 * Key layout:
 *   bill:{id}            -> Bill JSON
 *   bill:{id}:people     -> hash personId -> Person JSON (one field per friend,
 *                           so concurrent saves never overwrite each other)
 *   admin:{token}        -> bill id
 *
 * Uses Upstash Redis (Vercel Marketplace "Upstash for Redis", the successor of
 * Vercel KV) when its env vars are present; otherwise a local JSON file so the
 * app runs with zero setup in development.
 */
interface Store {
  getBill(id: string): Promise<Bill | null>;
  putBill(bill: Bill): Promise<void>;
  billIdForAdmin(token: string): Promise<string | null>;
  getPeople(billId: string): Promise<Person[]>;
  getPerson(billId: string, personId: string): Promise<Person | null>;
  putPerson(billId: string, person: Person): Promise<void>;
  deletePerson(billId: string, personId: string): Promise<void>;
  /** Rate-limit counter: current count for `key` (0 if expired/missing). */
  count(key: string): Promise<number>;
  /** Increment `key`; the window starts at the first hit and lasts `ttlSec`. */
  bump(key: string, ttlSec: number): Promise<number>;
}

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

function redisStore(redis: Redis): Store {
  return {
    getBill: (id) => redis.get<Bill>(`bill:${id}`),
    async putBill(bill) {
      await redis.set(`bill:${bill.id}`, bill);
      await redis.set(`admin:${bill.adminToken}`, bill.id);
    },
    billIdForAdmin: (t) => redis.get<string>(`admin:${t}`),
    async getPeople(billId) {
      const all = await redis.hgetall<Record<string, Person>>(`bill:${billId}:people`);
      return all ? Object.values(all) : [];
    },
    getPerson: (billId, pid) => redis.hget<Person>(`bill:${billId}:people`, pid),
    async putPerson(billId, person) {
      await redis.hset(`bill:${billId}:people`, { [person.id]: person });
    },
    async deletePerson(billId, pid) {
      await redis.hdel(`bill:${billId}:people`, pid);
    },
    count: async (key) => (await redis.get<number>(key)) ?? 0,
    async bump(key, ttlSec) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, ttlSec);
      return n;
    },
  };
}

interface FileDB {
  bills: Record<string, Bill>;
  admin: Record<string, string>;
  people: Record<string, Record<string, Person>>;
}

function fileStore(file: string): Store {
  const counters = new Map<string, { n: number; until: number }>();
  // Serialize writes within this process so read-modify-write is safe.
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<FileDB> => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return { bills: {}, admin: {}, people: {} };
    }
  };
  const mutate = (fn: (db: FileDB) => void) => {
    const next = queue.then(async () => {
      const db = await read();
      fn(db);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(db, null, 2));
    });
    queue = next.catch(() => {});
    return next;
  };
  return {
    getBill: async (id) => (await read()).bills[id] ?? null,
    putBill: (bill) =>
      mutate((db) => {
        db.bills[bill.id] = bill;
        db.admin[bill.adminToken] = bill.id;
      }),
    billIdForAdmin: async (t) => (await read()).admin[t] ?? null,
    getPeople: async (billId) => Object.values((await read()).people[billId] ?? {}),
    getPerson: async (billId, pid) => (await read()).people[billId]?.[pid] ?? null,
    putPerson: (billId, person) =>
      mutate((db) => {
        (db.people[billId] ??= {})[person.id] = person;
      }),
    deletePerson: (billId, pid) =>
      mutate((db) => {
        delete db.people[billId]?.[pid];
      }),
    async count(key) {
      const c = counters.get(key);
      return c && c.until > Date.now() ? c.n : 0;
    },
    async bump(key, ttlSec) {
      const c = counters.get(key);
      const next = c && c.until > Date.now() ? { ...c, n: c.n + 1 } : { n: 1, until: Date.now() + ttlSec * 1000 };
      counters.set(key, next);
      return next.n;
    },
  };
}

// `next dev` loads .env.local, which `vercel env pull` fills with the
// production Redis credentials. Keep local development on the file store
// unless explicitly asked, so testing never touches real bills.
const devWithoutRedis = process.env.NODE_ENV === "development" && process.env.USE_REDIS !== "1";

export const usingRedis = Boolean(url && token) && !devWithoutRedis;

/** On Vercel the filesystem is read-only, so without Redis every call fails loudly. */
const missingRedis = new Proxy({} as Store, {
  get() {
    return () =>
      Promise.reject(
        new Error(
          "No Redis configured. Add Upstash for Redis from the Vercel Marketplace (sets KV_REST_API_URL / KV_REST_API_TOKEN).",
        ),
      );
  },
});

export const store: Store = usingRedis
  ? redisStore(new Redis({ url: url!, token: token! }))
  : process.env.VERCEL
    ? missingRedis
    : fileStore(path.join(process.cwd(), ".data", "db.json"));
