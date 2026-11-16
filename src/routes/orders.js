import express from 'express';
import { validateId } from './validate-id.js';

export function createOrderRouter(database) {
  const router = express.Router();
  router.param('id', validateId);

  router.get('/:id', async (request, response) => {
    const result = await database.query(`
      SELECT o.id, o.order_number, o.status, o.created_at,
             c.id AS customer_id, c.name AS customer_name,
             c.email AS customer_email, c.phone AS customer_phone,
             COALESCE(SUM(ROUND(oi.quantity * oi.unit_price, 2)), 0.00) AS total
      FROM orders AS o
      JOIN customers AS c ON c.id = o.customer_id
      LEFT JOIN order_items AS oi ON oi.order_id = o.id
      WHERE o.id = $1
      GROUP BY o.id, c.id
    `, [request.params.id]);

    if (result.rowCount === 0) {
      return response.status(404).json({ error: 'Order not found.' });
    }

    const order = result.rows[0];
    response.json({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      created_at: order.created_at,
      customer: {
        id: order.customer_id,
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
      },
      total: order.total,
    });
  });

  router.get('/:id/items', async (request, response) => {
    const order = await database.query('SELECT id FROM orders WHERE id = $1', [request.params.id]);

    if (order.rowCount === 0) {
      return response.status(404).json({ error: 'Order not found.' });
    }

    const result = await database.query(`
      SELECT oi.id, a.sku, a.name AS article_name, a.unit,
             oi.quantity, oi.unit_price,
             ROUND(oi.quantity * oi.unit_price, 2) AS line_total
      FROM order_items AS oi
      JOIN articles AS a ON a.id = oi.article_id
      WHERE oi.order_id = $1
      ORDER BY oi.id
    `, [request.params.id]);

    response.json(result.rows);
  });

  return router;
}
