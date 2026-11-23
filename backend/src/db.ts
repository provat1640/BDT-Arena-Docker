import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

export interface QueryResult<R = any> {
  rows: R[];
  rowCount: number;
}

export interface IPoolClient {
  query<R = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
  release(): void;
}

export interface IPool {
  query<R = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
  connect(): Promise<pg.PoolClient>;
  end(): Promise<void>;
  on(event: string, listener: (...args: any[]) => void): IPool;
}

class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.locked = false;
    const next = this.queue.shift();
    if (next) next();
  }
}

class PGlitePool implements IPool {
  private pglite: PGlite | null = null;
  private mutex = new Mutex();
  private initPromise: Promise<void> | null = null;
  private listeners: Map<string, ((...args: any[]) => void)[]> = new Map();

  constructor(private dataDir?: string) {}

  private async ensureReady(): Promise<PGlite> {
    if (this.pglite) return this.pglite;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const dir = this.dataDir || path.resolve(process.cwd(), 'data', 'pgdata');
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[Database] Initializing persistent embedded PostgreSQL at ${dir}`);
        const instance = new PGlite(dir);
        await instance.waitReady;
        this.pglite = instance;

        // Auto-run migration if tables don't exist
        const check = await instance.query<{ count: string }>(
          "SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'"
        );
        if (Number(check.rows[0]?.count ?? 0) === 0) {
          console.log('[Database] Running initial schema migration and seed...');
          const migrationPath = path.resolve(process.cwd(), 'src/db/migration.sql');
          if (fs.existsSync(migrationPath)) {
            const sql = fs.readFileSync(migrationPath, 'utf8');
            await instance.exec(sql);
            console.log('[Database] Schema migration completed successfully');
          }
          // Run initial seed
          const bcrypt = (await import('bcryptjs')).default;
          await instance.query(
            `INSERT INTO users (phone, email, password_hash, role)
             VALUES
               ('+8801700000001', 'admin@bdtarena.local', $1, 'admin'),
               ('+8801700000002', 'demo@bdtarena.local', $2, 'user')
             ON CONFLICT (phone) DO NOTHING`,
            [
              await bcrypt.hash('Admin123!Sandbox', 12),
              await bcrypt.hash('Demo123!Sandbox', 12)
            ]
          );
          await instance.query(
            `INSERT INTO wallets (user_id, balance_minor)
             SELECT id, CASE WHEN role = 'admin' THEN 100000 ELSE 250000 END
             FROM users
             WHERE email IN ('admin@bdtarena.local', 'demo@bdtarena.local')
             ON CONFLICT (user_id) DO NOTHING`
          );
          console.log('[Database] Demo accounts seeded: admin@bdtarena.local / demo@bdtarena.local');
        }
      })();
    }
    await this.initPromise;
    return this.pglite!;
  }

  async query<R = any>(text: string, params?: any[]): Promise<QueryResult<R>> {
    const pg = await this.ensureReady();
    const unlock = await this.mutex.acquire();
    try {
      if (!params?.length && text.trim().includes(';') && (text.match(/;/g)?.length ?? 0) > 1) {
        const execRes = await pg.exec(text);
        const lastResult = execRes[execRes.length - 1];
        const rows = (lastResult?.rows ?? []) as R[];
        return {
          rows,
          rowCount: rows.length > 0 ? rows.length : (lastResult?.affectedRows ?? 0)
        };
      }
      const res = await pg.query<R>(text, params);
      return {
        rows: res.rows,
        rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0)
      };
    } catch (err) {
      this.emit('error', err);
      throw err;
    } finally {
      unlock();
    }
  }

  async connect(): Promise<pg.PoolClient> {
    const pg = await this.ensureReady();
    const unlock = await this.mutex.acquire();
    let released = false;

    return {
      query: async <R = any>(text: string, params?: any[]): Promise<QueryResult<R>> => {
        if (released) throw new Error('Client has already been released to the pool');
        if (!params?.length && text.trim().includes(';') && (text.match(/;/g)?.length ?? 0) > 1) {
          const execRes = await pg.exec(text);
          const lastResult = execRes[execRes.length - 1];
          const rows = (lastResult?.rows ?? []) as R[];
          return {
            rows,
            rowCount: rows.length > 0 ? rows.length : (lastResult?.affectedRows ?? 0)
          };
        }
        const res = await pg.query<R>(text, params);
        return {
          rows: res.rows,
          rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0)
        };
      },
      release: () => {
        if (!released) {
          released = true;
          unlock();
        }
      }
    } as unknown as pg.PoolClient;
  }

  async end(): Promise<void> {
    if (this.pglite) {
      await this.pglite.close();
      this.pglite = null;
    }
  }

  on(event: string, listener: (...args: any[]) => void): this {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(listener);
    return this;
  }

  private emit(event: string, ...args: any[]) {
    const list = this.listeners.get(event);
    if (list) for (const fn of list) fn(...args);
  }
}

function createPool(): IPool {
  const usePglite =
    process.env.USE_PGLITE === 'true' ||
    !process.env.DATABASE_URL ||
    process.env.DATABASE_URL.includes('localhost') ||
    process.env.DATABASE_URL.includes('127.0.0.1');

  if (!usePglite && process.env.DATABASE_URL) {
    console.log(`[Database] Connecting to PostgreSQL at ${process.env.DATABASE_URL.replace(/:[^:]+@/, ':****@')}`);
    return new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000
    }) as unknown as IPool;
  }

  return new PGlitePool();
}

export const pool = createPool();

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));
