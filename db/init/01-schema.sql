BEGIN;

CREATE TABLE customers (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    email TEXT NOT NULL CHECK (btrim(email) <> ''),
    phone TEXT NOT NULL CHECK (btrim(phone) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    order_number TEXT NOT NULL UNIQUE CHECK (btrim(order_number) <> ''),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE articles (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE CHECK (btrim(sku) <> ''),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    unit TEXT NOT NULL CHECK (unit IN ('m²', 'pcs', 'hours')),
    -- Exclude NaN explicitly: PostgreSQL treats it as greater than finite numbers.
    unit_price NUMERIC(12, 2) NOT NULL
        CHECK (unit_price >= 0 AND unit_price <> 'NaN'::numeric),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 3) NOT NULL
        CHECK (quantity > 0 AND quantity <> 'NaN'::numeric),
    -- A price snapshot, independent of the article's current catalog price.
    unit_price NUMERIC(12, 2) NOT NULL
        CHECK (unit_price >= 0 AND unit_price <> 'NaN'::numeric)
);

-- PostgreSQL indexes primary/unique keys automatically, but not foreign keys.
CREATE INDEX orders_customer_id_idx ON orders(customer_id);
CREATE INDEX order_items_order_id_idx ON order_items(order_id);
CREATE INDEX order_items_article_id_idx ON order_items(article_id);

COMMIT;
