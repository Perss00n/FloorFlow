import { fetchJson, getPageId } from './api.js';
import { formatDate, formatMoney, formatQuantity } from './format.js';
import { createStatusBadge, showMessage } from './ui.js';

async function loadOrder() {
  const id = getPageId(window.location.search);
  if (id === null) {
    showMessage('Invalid order link', 'Choose an order from a customer page to continue.');
    return;
  }

  try {
    const [order, items] = await Promise.all([
      fetchJson(`/api/orders/${id}`),
      fetchJson(`/api/orders/${id}/items`),
    ]);

    document.title = `${order.order_number} | FloorFlow`;
    document.getElementById('order-number').textContent = order.order_number;
    document.getElementById('order-date').textContent = formatDate(order.created_at);
    document.getElementById('order-status').append(createStatusBadge(order.status));
    document.getElementById('order-total').textContent = formatMoney(order.total);
    document.getElementById('customer-email').textContent = order.customer.email;
    document.getElementById('customer-phone').textContent = order.customer.phone;
    document.getElementById('item-count').textContent = items.length;

    const customerUrl = `/customer.html?id=${encodeURIComponent(order.customer.id)}`;
    for (const elementId of ['order-customer', 'customer-breadcrumb']) {
      const link = document.getElementById(elementId);
      link.href = customerUrl;
      link.textContent = order.customer.name;
    }
    document.getElementById('customer-breadcrumb-item').hidden = false;
    const back = document.getElementById('back-link');
    back.href = customerUrl;
    back.textContent = '← Back to customer';

    const body = document.getElementById('items-body');
    for (const item of items) {
      const row = body.insertRow();
      const article = row.insertCell();
      article.dataset.label = 'Article';
      const name = document.createElement('span');
      name.className = 'article-name';
      name.textContent = item.article_name;
      const sku = document.createElement('span');
      sku.className = 'article-sku';
      sku.textContent = item.sku;
      article.append(name, sku);

      const quantity = row.insertCell();
      quantity.dataset.label = 'Quantity';
      quantity.textContent = formatQuantity(item.quantity, item.unit);
      const price = row.insertCell();
      price.dataset.label = 'Unit price';
      price.className = 'amount';
      price.textContent = formatMoney(item.unit_price);
      const total = row.insertCell();
      total.dataset.label = 'Line total';
      total.className = 'amount';
      total.textContent = formatMoney(item.line_total);
    }

    document.getElementById('items-empty').hidden = items.length !== 0;
    document.getElementById('items-table').hidden = items.length === 0;
    document.getElementById('page-state').hidden = true;
    document.getElementById('order-content').hidden = false;
  } catch (error) {
    if (error.status === 404) {
      showMessage('Order not found', 'This order does not exist. Return to Customers to choose another.');
    } else {
      showMessage('Unable to load order', 'Please check your connection and reload the page to try again.', true);
    }
  }
}

loadOrder();
