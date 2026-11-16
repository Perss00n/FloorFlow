export function formatMoney(value) {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value)) {
    throw new TypeError('Money must be a non-negative decimal string with two decimal places.');
  }

  const [whole, fraction] = value.split('.');
  let grouped = '';
  // Insert a separator every three digits, counting from the right.
  for (let index = 0; index < whole.length; index += 1) {
    if (index > 0 && (whole.length - index) % 3 === 0) {
      grouped += ',';
    }
    grouped += whole[index];
  }

  return `${grouped}.${fraction} SEK`;
}

export function formatQuantity(value, unit) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) {
    throw new TypeError('Quantity must be a non-negative decimal string.');
  }

  // Trim fractional zeros only; an integer such as 1000 must keep all its digits.
  const quantity = value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
  return `${quantity} ${unit}`;
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(value));
}
