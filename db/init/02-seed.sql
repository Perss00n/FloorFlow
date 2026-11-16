-- Fictional development data. Run once, immediately after 01-schema.sql.
-- Fresh identity sequences assign IDs in the insertion order used below.
BEGIN;

INSERT INTO customers (name, email, phone, created_at) VALUES
    ('Maple Property Group', 'projects@maple-property.example', '+46 70 000 00 01', '2026-01-02 09:00:00+00'),
    ('Emma Carter', 'emma.carter@example.com', '+46 70 000 00 02', '2026-01-05 10:00:00+00'),
    ('Northside Cafe', 'owner@northside-cafe.example', '+46 70 000 00 03', '2026-01-08 11:00:00+00'),
    ('Harbor Office Studio', 'facilities@harbor-office.example', '+46 70 000 00 04', '2026-01-12 08:00:00+00'),
    ('Daniel Brooks', 'daniel.brooks@example.com', '+46 70 000 00 05', '2026-02-01 12:00:00+00');

-- All prices are SEK excluding VAT. One adhesive/primer unit is one bucket.
INSERT INTO articles (sku, name, unit, unit_price, created_at) VALUES
    ('OAK-ENG-14', 'Engineered oak flooring, 14 mm', 'm²', 590.00, '2026-01-01 08:00:00+00'),
    ('ASH-ENG-14', 'Engineered ash flooring, 14 mm', 'm²', 490.00, '2026-01-01 08:00:00+00'),
    ('LAM-OAK-08', 'Oak-effect laminate flooring, 8 mm', 'm²', 249.00, '2026-01-01 08:00:00+00'),
    ('VIN-STONE-05', 'Stone-effect vinyl flooring, 5 mm', 'm²', 329.00, '2026-01-01 08:00:00+00'),
    ('ADH-WOOD-15', 'Wood flooring adhesive, 15 kg bucket', 'pcs', 749.00, '2026-01-01 08:00:00+00'),
    ('PRIMER-05', 'Subfloor primer, 5 L bucket', 'pcs', 395.00, '2026-01-01 08:00:00+00'),
    ('UNDERLAY-03', 'Acoustic underlay, 3 mm', 'm²', 49.00, '2026-01-01 08:00:00+00'),
    ('SKIRT-WHITE-24', 'White skirting board, 2.4 m length', 'pcs', 129.00, '2026-01-01 08:00:00+00'),
    ('TRIM-OAK-09', 'Oak transition strip, 0.9 m length', 'pcs', 199.00, '2026-01-01 08:00:00+00'),
    ('LAB-INSTALL', 'Flooring installation labor', 'hours', 620.00, '2026-01-01 08:00:00+00'),
    ('LAB-PREP', 'Subfloor preparation labor', 'hours', 580.00, '2026-01-01 08:00:00+00'),
    ('LAB-REMOVE', 'Existing flooring removal labor', 'hours', 540.00, '2026-01-01 08:00:00+00');

INSERT INTO orders (customer_id, order_number, status, created_at) VALUES
    (1, 'FF-2026-001', 'completed', '2026-01-15 08:00:00+00'),
    (1, 'FF-2026-002', 'completed', '2026-01-28 08:00:00+00'),
    (2, 'FF-2026-003', 'completed', '2026-02-04 08:00:00+00'),
    (3, 'FF-2026-004', 'completed', '2026-02-12 08:00:00+00'),
    (4, 'FF-2026-005', 'completed', '2026-02-20 08:00:00+00'),
    (4, 'FF-2026-006', 'completed', '2026-03-02 08:00:00+00'),
    (5, 'FF-2026-007', 'completed', '2026-03-10 08:00:00+00'),
    (1, 'FF-2026-008', 'completed', '2026-03-18 08:00:00+00'),
    (2, 'FF-2026-009', 'pending', '2026-04-01 08:00:00+00'),
    (3, 'FF-2026-010', 'cancelled', '2026-04-02 08:00:00+00'),
    (4, 'FF-2026-011', 'draft', '2026-04-03 08:00:00+00'),
    (5, 'FF-2026-012', 'pending', '2026-04-04 08:00:00+00');

-- Historical prices intentionally differ from current article prices.
INSERT INTO order_items (order_id, article_id, quantity, unit_price) VALUES
    (1, 1, 40.500, 550.00),
    (1, 5, 3.000, 700.00),
    (1, 8, 18.000, 119.00),
    (1, 10, 16.000, 600.00),
    (2, 3, 25.000, 239.00),
    (2, 7, 25.000, 45.00),
    (2, 8, 10.000, 119.00),
    (2, 10, 8.000, 600.00),
    (3, 1, 22.750, 570.00),
    (3, 5, 2.000, 720.00),
    (3, 8, 12.000, 125.00),
    (3, 10, 10.000, 610.00),
    (4, 4, 65.000, 310.00),
    (4, 6, 3.000, 380.00),
    (4, 11, 12.500, 560.00),
    (4, 10, 24.000, 610.00),
    (5, 2, 80.000, 470.00),
    (5, 5, 6.000, 720.00),
    (5, 8, 30.000, 125.00),
    (5, 10, 32.000, 610.00),
    (6, 12, 18.500, 520.00),
    (6, 11, 15.000, 570.00),
    (6, 4, 45.250, 320.00),
    (6, 10, 18.000, 620.00),
    (7, 3, 18.500, 249.00),
    (7, 7, 18.500, 49.00),
    (7, 9, 2.000, 199.00),
    (7, 10, 6.500, 620.00),
    (8, 1, 55.250, 590.00),
    (8, 5, 4.000, 749.00),
    (8, 8, 24.000, 129.00),
    (8, 10, 22.000, 620.00),
    (9, 1, 32.500, 590.00),
    (9, 5, 3.000, 749.00),
    (9, 8, 14.000, 129.00),
    (9, 10, 14.000, 620.00),
    (10, 4, 30.000, 329.00),
    (10, 6, 2.000, 395.00),
    (10, 12, 10.000, 540.00),
    (10, 10, 12.000, 620.00),
    (11, 2, 40.000, 490.00),
    (11, 5, 3.000, 749.00),
    (11, 8, 16.000, 129.00),
    (11, 10, 16.000, 620.00),
    (12, 3, 28.750, 249.00),
    (12, 7, 28.750, 49.00),
    (12, 8, 12.000, 129.00),
    (12, 10, 10.000, 620.00);

COMMIT;
