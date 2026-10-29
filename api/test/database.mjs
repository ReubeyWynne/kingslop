import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function environment() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  class Statement {
    constructor(query, values = []) { this.query = query; this.values = values; }
    bind(...values) { return new Statement(this.query, values); }
    async first() { return sql.prepare(this.query).get(...this.values) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.values) }; }
    async run() { const statement = sql.prepare(this.query); if (/^\s*SELECT/i.test(this.query)) return { results: statement.all(...this.values), meta: { changes: 0 } }; return { meta: { changes: Number(statement.run(...this.values).changes) } }; }
  }
  return {
    sql,
    DB: {
      prepare(query) { return new Statement(query); },
      async batch(statements) {
        sql.exec('BEGIN');
        try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result; }
        catch (error) { sql.exec('ROLLBACK'); throw error; }
      }
    },
    CREATE_LIMIT: { async limit() { return { success: true }; } },
    REQUEST_LIMIT: { async limit() { return { success: true }; } },
    ALLOWED_ORIGINS: 'https://dey.ci',
    ASSETS: { async fetch() { return new Response('Vikings plans'); } }
  };
}
