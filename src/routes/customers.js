import express from 'express';
import { validateId } from './validate-id.js';

export function createCustomerRouter(database) {
  const router = express.Router();
  router.param('id', validateId);

  router.get('/', async (request, response) => {
    const result = await database.query(`
      SELECT id, name, email, phone
      FROM customers
      ORDER BY name, id
    `);

    response.json(result.rows);
  });

  router.get('/:id', async (request, response) => {
    const result = await database.query(`
      SELECT id, name, email, phone, created_at
      FROM customers
      WHERE id = $1
    `, [request.params.id]);

    if (result.rowCount === 0) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    response.json(result.rows[0]);
  });

  router.get('/:id/orders', async (request, response) => {
    const customer = await database.query('SELECT id FROM customers WHERE id = $1', [request.params.id]);

    if (customer.rowCount === 0) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    // The parent check distinguishes a missing customer from one with no orders.
    const result = await database.query(`
      SELECT o.id, o.order_number, o.status, o.created_at,
             COALESCE(SUM(ROUND(oi.quantity * oi.unit_price, 2)), 0.00) AS total
      FROM orders AS o
      LEFT JOIN order_items AS oi ON oi.order_id = o.id
      WHERE o.customer_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC, o.id DESC
    `, [request.params.id]);

    response.json(result.rows);
  });

  return router;
}
