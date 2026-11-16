-- Read-only examples for the unchanged development seed.
-- Expected counts: 5 customers, 12 orders, 12 articles, 48 order items.
SELECT 'customers' AS table_name, COUNT(*) FROM customers
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'articles', COUNT(*) FROM articles
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items;

-- Expected: three foreign keys, plus indexes on their referencing columns.
SELECT conrelid::regclass AS table_name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Completed sales: 285415.00 SEK excluding VAT.
-- Round each line to two decimal places, then sum the line totals.
SELECT COALESCE(SUM(ROUND(oi.quantity * oi.unit_price, 2)), 0) AS total_sales_sek
FROM orders AS o
JOIN order_items AS oi ON oi.order_id = o.id
WHERE o.status = 'completed';

-- Highest-spending customer first: Harbor Office Studio, 109000.00 SEK.
SELECT c.name, SUM(ROUND(oi.quantity * oi.unit_price, 2)) AS completed_spending_sek
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
JOIN order_items AS oi ON oi.order_id = o.id
WHERE o.status = 'completed'
GROUP BY c.id, c.name
ORDER BY completed_spending_sek DESC, c.id;

-- Engineered oak sold: 118.500 m². Laminate and underlay are different articles.
SELECT a.sku, a.name, SUM(oi.quantity) AS quantity_sold, a.unit
FROM articles AS a
JOIN order_items AS oi ON oi.article_id = a.id
JOIN orders AS o ON o.id = oi.order_id
WHERE o.status = 'completed' AND a.sku = 'OAK-ENG-14'
GROUP BY a.id, a.sku, a.name, a.unit;

-- Every seeded order must have items: expected zero rows.
SELECT o.order_number
FROM orders AS o
LEFT JOIN order_items AS oi ON oi.order_id = o.id
GROUP BY o.id, o.order_number
HAVING COUNT(oi.id) = 0;
