import { fetchJson } from './api.js';
import { showMessage } from './ui.js';

async function loadCustomers() {
  try {
    const customers = await fetchJson('/api/customers');
    const count = document.getElementById('customer-count');
    count.textContent = customers.length;
    count.hidden = false;

    if (customers.length === 0) {
      showMessage('No customers yet', 'Customers will appear here when they are available.');
      return;
    }

    const list = document.getElementById('customer-list');
    for (const customer of customers) {
      const row = document.createElement('li');
      row.className = 'customer-row';
      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = customer.name.slice(0, 1).toUpperCase();

      const details = document.createElement('div');
      const link = document.createElement('a');
      link.className = 'customer-name';
      link.href = `/customer.html?id=${encodeURIComponent(customer.id)}`;
      link.textContent = customer.name;
      const hint = document.createElement('p');
      hint.className = 'customer-hint';
      hint.textContent = 'View customer & orders →';
      details.append(link, hint);

      const contact = document.createElement('div');
      contact.className = 'customer-contact';
      const email = document.createElement('p');
      email.textContent = customer.email;
      const phone = document.createElement('p');
      phone.textContent = customer.phone;
      contact.append(email, phone);
      row.append(avatar, details, contact);
      list.append(row);
    }

    document.getElementById('page-state').hidden = true;
    list.hidden = false;
  } catch {
    showMessage('Unable to load customers', 'Please check your connection and reload the page to try again.', true);
  }
}

loadCustomers();
