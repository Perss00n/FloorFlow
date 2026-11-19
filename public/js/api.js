export async function fetchJson(path) {
  const response = await fetch(path, { signal: AbortSignal.timeout(10000) });

  if (!response.ok) {
    // Use the status for not-found handling; never display raw server responses.
    const error = new Error('Unable to load data from FloorFlow.');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

// Gateways may replace an AI error with HTML. Never render that body as a reply.
export async function readAssistantReply(response) {
  let data;
  try { data = await response.json(); }
  catch (error) {
    if (response.ok) throw error;
    data = { error: 'The AI service could not complete this request. Please rephrase your question or try again later.' };
  }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'));
    const message = typeof data?.error === 'string' ? data.error : 'The assistant request limit was reached.';
    return { error: message + (Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400 ? ` Please wait ${seconds} seconds.` : '') };
  }
  return data;
}

export function getPageId(search) {
  const ids = new URLSearchParams(search).getAll('id');
  if (ids.length !== 1) {
    return null;
  }

  const id = ids[0];
  const number = Number(id);
  if (!/^\d+$/.test(id) || !Number.isInteger(number) || number < 1 || number > 2147483647) {
    return null;
  }

  return id;
}
