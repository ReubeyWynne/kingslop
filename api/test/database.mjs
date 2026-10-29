import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function environment() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  sql.exec(readFileSync(new URL('../migrations/0001_vikings.sql', import.meta.url), 'utf8'));
  class Statement {
    constructor(query, values = []) { this.query = query; this.values = values; }
    bind(...values) { return new Statement(this.query, values); }
    async first() { return sql.prepare(this.query).get(...this.values) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.values) }; }
    async run() { return { meta: { changes: Number(sql.prepare(this.query).run(...this.values).changes) } }; }
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
