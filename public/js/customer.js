import { fetchJson, getPageId } from './api.js';
import { formatDate, formatMoney } from './format.js';
import { createStatusBadge, showMessage } from './ui.js';

async function loadCustomer() {
  const id = getPageId(window.location.search);
  if (id === null) {
    showMessage('Invalid customer link', 'Choose a customer from the customer overview to continue.');
    return;
  }

  try {
    const [customer, orders] = await Promise.all([
      fetchJson(`/api/customers/${id}`),
      fetchJson(`/api/customers/${id}/orders`),
    ]);

    document.title = `${customer.name} | FloorFlow`;
    document.getElementById('customer-name').textContent = customer.name;
    document.getElementById('customer-email').textContent = customer.email;
    document.getElementById('customer-phone').textContent = customer.phone;
    document.getElementById('order-count').textContent = orders.length;

    const body = document.getElementById('orders-body');
    for (const order of orders) {
      const row = body.insertRow();
      const number = row.insertCell();
      number.dataset.label = 'Order number';
      const link = document.createElement('a');
      link.href = `/order.html?id=${encodeURIComponent(order.id)}`;
      link.textContent = order.order_number;
      number.append(link);

      const status = row.insertCell();
      status.dataset.label = 'Status';
      status.append(createStatusBadge(order.status));
      const date = row.insertCell();
      date.dataset.label = 'Created';
      date.textContent = formatDate(order.created_at);
      const total = row.insertCell();
      total.dataset.label = 'Order total';
      total.className = 'amount';
      total.textContent = formatMoney(order.total);
    }

    document.getElementById('orders-empty').hidden = orders.length !== 0;
    document.getElementById('orders-table').hidden = orders.length === 0;
    document.getElementById('page-state').hidden = true;
    document.getElementById('customer-content').hidden = false;
  } catch (error) {
    if (error.status === 404) {
      showMessage('Customer not found', 'This customer does not exist. Return to Customers to choose another.');
    } else {
      showMessage('Unable to load customer', 'Please check your connection and reload the page to try again.', true);
    }
  }
}

loadCustomer();
