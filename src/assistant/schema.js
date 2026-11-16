import { readFileSync } from 'node:fs';
import { parse } from 'pgsql-ast-parser';

export const schemaSql = readFileSync(new URL('../../db/init/01-schema.sql', import.meta.url), 'utf8');
const approvedTables = new Set(['customers', 'orders', 'order_items', 'articles']);

// The same schema supplies the model context and the validator's column names.
export const tableColumns = new Map(parse(schemaSql)
  .filter((statement) => statement.type === 'create table' && approvedTables.has(statement.name.name))
  .map((statement) => [statement.name.name, new Set(statement.columns.map((column) => column.name.name))]));

if (tableColumns.size !== 4) {
  throw new Error('The assistant schema must contain the four approved application tables.');
}
