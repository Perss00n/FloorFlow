import { formatMoney } from './format.js';

const form = document.getElementById('assistant-form');
const input = document.getElementById('assistant-question');
const send = document.getElementById('assistant-send');
const state = document.getElementById('assistant-state');
const messages = document.getElementById('chat-messages');

function addMessage(label, text) {
  const message = document.createElement('section');
  message.className = 'chat-message';
  const heading = document.createElement('h3');
  heading.textContent = label;
  const content = document.createElement('p');
  content.textContent = text;
  message.append(heading, content);
  messages.append(message);
  // Keep this browser-only transcript small; history is never sent to the model.
  while (messages.children.length > 10) messages.firstElementChild.remove();
  return message;
}

function addResults(message, data) {
  if (data.results.length > 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'assistant-results';
    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.textContent = 'Query results · Monetary amounts in SEK excluding VAT';
    table.append(caption);
    const header = table.createTHead().insertRow();
    for (const column of data.columns) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = column.replace(/_/g, ' ');
      header.append(cell);
    }
    const body = table.createTBody();
    for (const result of data.results) {
      const row = body.insertRow();
      for (const column of data.columns) {
        const value = result[column];
        row.insertCell().textContent = column.endsWith('_sek') && typeof value === 'string' && /^\d+\.\d{2}$/.test(value)
          ? formatMoney(value) : value === null ? 'No value' : String(value);
      }
    }
    wrapper.append(table);
    message.append(wrapper);
  }
  if (data.sql) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'View generated SQL';
    const note = document.createElement('p');
    note.textContent = 'Executed SQL. String values are bound separately as parameters.';
    const sql = document.createElement('pre');
    sql.textContent = data.sql;
    details.append(summary, note, sql);
    message.append(details);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (send.disabled) return;
  const question = input.value.trim();
  if (!question || input.value.length > 1000) return;
  addMessage('You', question);
  send.disabled = true;
  input.disabled = true;
  state.textContent = 'Checking your question and querying the database…';
  form.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/assistant/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question }), signal: AbortSignal.timeout(35000),
    });
    const data = await response.json();
    if (!response.ok) {
      addMessage('Assistant unavailable', typeof data.error === 'string' ? data.error : 'Please try again later.');
      return;
    }
    const message = addMessage('FloorFlow', data.answer);
    addResults(message, data);
    input.value = '';
  } catch {
    addMessage('Assistant unavailable', 'The request could not be completed. Please check your connection and try again later.');
  } finally {
    state.textContent = 'All monetary amounts are in SEK, excluding VAT.';
    send.disabled = false;
    input.disabled = false;
    form.removeAttribute('aria-busy');
    input.focus();
    messages.scrollTop = messages.scrollHeight;
  }
});
