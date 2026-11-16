import { parse, toSql, astMapper } from 'pgsql-ast-parser';
import { tableColumns } from './schema.js';
import { AssistantError } from './errors.js';

export const maxRows = 50;
const identifier = /^[a-z][a-z0-9_]{0,47}$/;
const operators = new Set(['=', '!=', '<>', '<', '<=', '>', '>=', 'AND', 'OR', '+', '-', '*', '/', 'LIKE', 'ILIKE', 'NOT LIKE', 'NOT ILIKE', 'IN', 'NOT IN']);
const functions = new Set(['sum', 'count', 'min', 'max', 'avg', 'round', 'coalesce', 'lower', 'upper']);
const relationships = new Set([
  'orders.customer_id=customers.id',
  'order_items.order_id=orders.id',
  'order_items.article_id=articles.id',
]);

function reject() {
  throw new AssistantError(422, 'The generated query could not be verified as safe. Please rephrase your question.');
}

function keys(object, allowed) {
  if (!object || typeof object !== 'object' || Object.keys(object).some((key) => key !== '_location' && !allowed.includes(key))) reject();
}

export function validateSql(sql) {
  if (typeof sql !== 'string' || sql.length === 0 || sql.length > 6000 || (sql.match(/\(/g) ?? []).length > 40) reject();
  let statements;
  try {
    statements = parse(sql, { locationTracking: true });
  } catch {
    reject();
  }
  if (statements.length !== 1) reject();
  const select = statements[0];
  keys(select, ['type', 'columns', 'from', 'where', 'groupBy', 'having', 'orderBy', 'limit', 'distinct']);
  if (select.type !== 'select' || !select.from?.length || select.from.length > 4 || !select.columns?.length || select.columns.length > 8) reject();
  if (select.distinct !== undefined && select.distinct !== 'distinct') reject();

  const sources = new Map();
  const usedTables = new Set();
  for (const [index, source] of select.from.entries()) {
    keys(source, ['type', 'name', 'join']);
    keys(source.name, ['name', 'schema', 'alias']);
    const name = source.name.name;
    const alias = source.name.alias ?? name;
    if (source.type !== 'table' || !tableColumns.has(name) || usedTables.has(name) || !identifier.test(alias)) reject();
    if (source.name.schema !== undefined && source.name.schema !== 'public') reject();
    if (sources.has(alias) || (index === 0 && source.join) || (index > 0 && !source.join)) reject();
    usedTables.add(name);
    sources.set(alias, name);
    source.name.schema = 'public';
  }

  const outputNames = new Set();
  let nodes = 0;
  // Returns true only when an expression depends on application data.
  function expression(node, depth = 0, allowAlias = false, allowStar = false) {
    if (!node || ++nodes > 200 || depth > 16) reject();
    switch (node.type) {
      case 'ref': {
        keys(node, ['type', 'name', 'table']);
        if (node.name === '*') {
          if (!allowStar || node.table) reject();
          return true;
        }
        if (!identifier.test(node.name)) reject();
        if (node.table) {
          keys(node.table, ['name']);
          if (!sources.has(node.table.name) || !tableColumns.get(sources.get(node.table.name)).has(node.name)) reject();
        } else if (!(allowAlias && outputNames.has(node.name))) {
          const matches = [...sources.values()].filter((name) => tableColumns.get(name).has(node.name));
          if (matches.length !== 1) reject();
        }
        return true;
      }
      case 'integer':
      case 'numeric':
        keys(node, ['type', 'value']);
        // The parser represents literals as JS numbers. Only bounded integers and
        // numeric zero are accepted; actual money values stay in PostgreSQL.
        if (!Number.isSafeInteger(node.value) || Math.abs(node.value) > 1000000 || (node.type === 'numeric' && node.value !== 0)) reject();
        // A tiny nonzero decimal can underflow to JS zero in the parser. Verify
        // the original zero literal before regenerating it, so its meaning stays exact.
        if (node.type === 'numeric' && !/^[+-]?(?:0+(?:\.0*)?|\.0+)$/.test(sql.slice(node._location.start, node._location.end))) reject();
        return false;
      case 'string':
        keys(node, ['type', 'value']);
        if (node.value.length > 200 || /[\\\x00-\x1f]/.test(node.value)) reject();
        return false;
      case 'null':
        keys(node, ['type']);
        return false;
      case 'boolean':
        keys(node, ['type', 'value']);
        return false;
      case 'binary': {
        keys(node, ['type', 'left', 'right', 'op']);
        if (!operators.has(node.op)) reject();
        const left = expression(node.left, depth + 1);
        const right = expression(node.right, depth + 1);
        return left || right;
      }
      case 'unary':
        keys(node, ['type', 'op', 'operand']);
        if (!['NOT', '-', '+', 'IS NULL', 'IS NOT NULL'].includes(node.op)) reject();
        return expression(node.operand, depth + 1);
      case 'list': {
        keys(node, ['type', 'expressions']);
        if (node.expressions.length > 20) reject();
        const dependencies = node.expressions.map((item) => expression(item, depth + 1));
        return dependencies.some(Boolean);
      }
      case 'cast':
        keys(node, ['type', 'operand', 'to']);
        keys(node.to, ['name']);
        if (node.to.name !== 'numeric') reject();
        return expression(node.operand, depth + 1);
      case 'call': {
        keys(node, ['type', 'function', 'args', 'distinct']);
        keys(node.function, ['name', 'schema']);
        const name = node.function.name;
        if (!functions.has(name) || (node.function.schema !== undefined && node.function.schema !== 'pg_catalog')) reject();
        if (node.distinct !== undefined && node.distinct !== 'distinct') reject();
        const count = node.args?.length ?? 0;
        if (name === 'coalesce' ? count < 2 || count > 4 : count !== (name === 'round' ? 2 : 1)) reject();
        if (name === 'round' && (node.args[1].type !== 'integer' || node.args[1].value !== 2)) reject();
        const dependencies = node.args.map((arg) => expression(arg, depth + 1, false, name === 'count'));
        return dependencies.some(Boolean);
      }
      default:
        reject();
    }
  }

  for (const [index, source] of select.from.entries()) {
    if (index === 0) continue;
    const join = source.join;
    keys(join, ['type', 'on']);
    if (!['INNER JOIN', 'LEFT JOIN'].includes(join.type) || join.on?.type !== 'binary' || join.on.op !== '=') reject();
    expression(join.on);
    const { left, right } = join.on;
    if (left.type !== 'ref' || right.type !== 'ref' || !left.table || !right.table) reject();
    const currentAlias = source.name.alias ?? source.name.name;
    const earlier = new Set(select.from.slice(0, index).map((item) => item.name.alias ?? item.name.name));
    if (!((left.table.name === currentAlias && earlier.has(right.table.name)) || (right.table.name === currentAlias && earlier.has(left.table.name)))) reject();
    const a = `${sources.get(left.table.name)}.${left.name}`;
    const b = `${sources.get(right.table.name)}.${right.name}`;
    if (!relationships.has(`${a}=${b}`) && !relationships.has(`${b}=${a}`)) reject();
  }

  for (const column of select.columns) {
    keys(column, ['expr', 'alias']);
    if (!expression(column.expr)) reject();
    if (column.alias) keys(column.alias, ['name']);
    const name = column.alias?.name ?? (column.expr.type === 'ref' ? column.expr.name : null);
    if (!name || !identifier.test(name) || outputNames.has(name)) reject();
    outputNames.add(name);
  }
  if (select.where) expression(select.where);
  if ((select.groupBy?.length ?? 0) > 8) reject();
  for (const group of select.groupBy ?? []) expression(group);
  if (select.having) expression(select.having);
  if ((select.orderBy?.length ?? 0) > 4) reject();
  for (const order of select.orderBy ?? []) {
    keys(order, ['by', 'order', 'nulls']);
    if (order.order !== undefined && !['ASC', 'DESC'].includes(order.order)) reject();
    if (order.nulls !== undefined && !['FIRST', 'LAST'].includes(order.nulls)) reject();
    expression(order.by, 0, true);
  }
  let limit = maxRows + 1;
  if (select.limit) {
    keys(select.limit, ['limit']);
    keys(select.limit.limit, ['type', 'value']);
    const value = select.limit.limit.value;
    if (select.limit.limit.type !== 'integer' || !Number.isSafeInteger(value) || value < 1) reject();
    limit = Math.min(value, limit);
  }
  select.limit = { limit: { type: 'integer', value: limit } };
  // Execute only regenerated, validated syntax, never the original model text.
  try {
    const values = [];
    const mapper = astMapper(() => ({
      constant(node) {
        if (node.type !== 'string') return node;
        values.push(node.value);
        return { type: 'parameter', name: `$${values.length}` };
      },
    }));
    return { text: toSql.statement(mapper.statement(select)), values };
  } catch {
    reject();
  }
}
