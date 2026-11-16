import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDate, formatMoney, formatQuantity } from '../public/js/format.js';

test('money formatting groups digits and preserves two decimal places', () => {
  assert.equal(formatMoney('0.00'), '0.00 SEK');
  assert.equal(formatMoney('0.01'), '0.01 SEK');
  assert.equal(formatMoney('999.50'), '999.50 SEK');
  assert.equal(formatMoney('1000.00'), '1,000.00 SEK');
  assert.equal(formatMoney('36117.00'), '36,117.00 SEK');
  assert.equal(formatMoney('52329.50'), '52,329.50 SEK');
});

test('money formatting preserves every digit beyond JavaScript numeric precision', () => {
  assert.equal(formatMoney('9007199254740993.01'), '9,007,199,254,740,993.01 SEK');
  assert.equal(formatMoney('9999999999980013842.00'), '9,999,999,999,980,013,842.00 SEK');
});

test('money formatting rejects numbers and malformed decimal strings', () => {
  for (const value of [36117, null, undefined, '', '1', '1.5', '1.234', '-1.00', 'NaN', '1e3', '1,000.00']) {
    assert.throws(() => formatMoney(value), TypeError);
  }
});

test('quantities remove only unnecessary fractional zeros and retain their units', () => {
  assert.equal(formatQuantity('40.500', 'm²'), '40.5 m²');
  assert.equal(formatQuantity('3.000', 'pcs'), '3 pcs');
  assert.equal(formatQuantity('16.000', 'hours'), '16 hours');
  assert.equal(formatQuantity('0.125', 'hours'), '0.125 hours');
  assert.equal(formatQuantity('1000', 'pcs'), '1000 pcs');
  assert.equal(formatQuantity('0.000', 'm²'), '0 m²');
  assert.equal(formatQuantity('999999999.999', 'm²'), '999999999.999 m²');
});

test('quantity formatting rejects numbers and malformed decimal strings', () => {
  for (const value of [3, null, '', '-1.000', '1e3', 'NaN', '1.2.3']) {
    assert.throws(() => formatQuantity(value, 'pcs'), TypeError);
  }
});

test('dates use English and UTC so the displayed day does not depend on local timezone', () => {
  assert.equal(formatDate('2026-01-15T08:00:00.000Z'), '15 Jan 2026');
  assert.equal(formatDate('2026-01-01T23:30:00.000Z'), '1 Jan 2026');
});
