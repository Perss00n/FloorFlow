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
