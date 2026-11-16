export function showMessage(title, message, allowReload = false) {
  document.getElementById('state-title').textContent = title;
  document.getElementById('state-message').textContent = message;
  document.getElementById('retry-link').hidden = !allowReload;
}

export function createStatusBadge(status) {
  const labels = { completed: 'Completed', pending: 'Pending', draft: 'Draft', cancelled: 'Cancelled' };
  const knownStatus = Object.hasOwn(labels, status);
  const badge = document.createElement('span');
  badge.className = `status status-${knownStatus ? status : 'draft'}`;
  badge.textContent = knownStatus ? labels[status] : 'Unknown';
  return badge;
}
