import { generateSql } from './model.js';
import { executeReadQuery } from './database.js';
import { formatMoney, formatQuantity } from '../../public/js/format.js';

// This is deterministic wording, not a second model request. Every displayed value
// comes from a returned row. The existing pure string formatter is safe in Node too.
export function buildAnswer({ columns, results, truncated }) {
  if (results.length === 0) return 'No matching records were found.';
  if (results.length === 1 && !truncated) {
    if (columns.length === 1 && results[0][columns[0]] === null) return 'No value is available for this query.';
    const descriptions = columns.map((name) => {
      const value = results[0][name];
      const words = name.replace(/_(sek|m2|hours)$/, '').replace(/_/g, ' ');
      const label = words.charAt(0).toUpperCase() + words.slice(1);
      let display = value === null ? 'No value' : String(value);
      if (value !== null && name.endsWith('_sek')) {
        display = typeof value === 'string' && /^\d+\.\d{2}$/.test(value) ? formatMoney(value) : `${value} SEK`;
      } else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) && (name.endsWith('_m2') || name.endsWith('_hours'))) {
        display = formatQuantity(value, name.endsWith('_m2') ? 'm²' : 'hours');
      }
      return `${label}: ${display}`;
    });
    return `${descriptions.join('; ')}.${columns.some((name) => name.endsWith('_sek')) ? ' Amounts are in SEK, excluding VAT.' : ''}`;
  }
  return `The query returned ${results.length} ${results.length === 1 ? 'record' : 'records'}${truncated ? ' (the display limit was reached)' : ''}. See the results below. Monetary amounts are in SEK, excluding VAT.`;
}

export function createAssistant({ modelClient, model, readPool }) {
  return {
    async chat(question) {
      const generated = await generateSql(modelClient, model, question);
      if (generated === null) {
        return { answer: 'That question cannot be answered from the available customer, order and article records.', sql: null, columns: [], results: [], truncated: false };
      }
      const data = await executeReadQuery(readPool, generated);
      return { answer: buildAnswer(data), ...data };
    },
  };
}
