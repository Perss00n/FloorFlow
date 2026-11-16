# FloorFlow read-only API (M2)

Base URL for local development: `http://127.0.0.1:3000`.
All examples below are complete responses from the unchanged M1 seed.
Successful requests return HTTP 200 and JSON. Collections are plain arrays;
single resources are plain objects. Timestamps are ISO 8601 UTC strings.

All prices and totals are **SEK excluding VAT**. Monetary values are JSON
strings with two decimal places, and quantities are strings with three decimal
places. IDs are JSON integers. There is no authentication or write API in M2.

## GET /api/customers

Returns all customers sorted by name, then ID. The list selects ID, name,
email, and phone; creation time is available in the detail response.

```json
[
  {
    "id": 5,
    "name": "Daniel Brooks",
    "email": "daniel.brooks@example.com",
    "phone": "+46 70 000 00 05"
  },
  {
    "id": 2,
    "name": "Emma Carter",
    "email": "emma.carter@example.com",
    "phone": "+46 70 000 00 02"
  },
  {
    "id": 4,
    "name": "Harbor Office Studio",
    "email": "facilities@harbor-office.example",
    "phone": "+46 70 000 00 04"
  },
  {
    "id": 1,
    "name": "Maple Property Group",
    "email": "projects@maple-property.example",
    "phone": "+46 70 000 00 01"
  },
  {
    "id": 3,
    "name": "Northside Cafe",
    "email": "owner@northside-cafe.example",
    "phone": "+46 70 000 00 03"
  }
]
```

## GET /api/customers/:id

Example: `/api/customers/1`. Selects one customer by parameterized ID.
Returns 404 if that customer does not exist.

```json
{
  "id": 1,
  "name": "Maple Property Group",
  "email": "projects@maple-property.example",
  "phone": "+46 70 000 00 01",
  "created_at": "2026-01-02T09:00:00.000Z"
}
```

## GET /api/customers/:id/orders

Example: `/api/customers/1/orders`. Checks that the customer exists, then selects
that customer's orders with a `LEFT JOIN` to their items. Grouping by order
calculates one total per order. Orders are sorted by creation time descending,
then ID descending. All statuses are included.

Returns 404 if the customer is missing. An existing customer without orders
returns `[]`. An existing order without items has a total of `"0.00"`.

```json
[
  {
    "id": 8,
    "order_number": "FF-2026-008",
    "status": "completed",
    "created_at": "2026-03-18T08:00:00.000Z",
    "total": "52329.50"
  },
  {
    "id": 2,
    "order_number": "FF-2026-002",
    "status": "completed",
    "created_at": "2026-01-28T08:00:00.000Z",
    "total": "13090.00"
  },
  {
    "id": 1,
    "order_number": "FF-2026-001",
    "status": "completed",
    "created_at": "2026-01-15T08:00:00.000Z",
    "total": "36117.00"
  }
]
```

## GET /api/orders/:id

Example: `/api/orders/1`. Joins the order to its customer and uses a `LEFT JOIN`
to aggregate the items. JavaScript groups the selected customer fields into a
nested object; it does not calculate or convert amounts. Returns 404 if the
order is missing. An order without items has a total of `"0.00"`.

```json
{
  "id": 1,
  "order_number": "FF-2026-001",
  "status": "completed",
  "created_at": "2026-01-15T08:00:00.000Z",
  "customer": {
    "id": 1,
    "name": "Maple Property Group",
    "email": "projects@maple-property.example",
    "phone": "+46 70 000 00 01"
  },
  "total": "36117.00"
}
```

## GET /api/orders/:id/items

Example: `/api/orders/1/items`. Checks that the order exists, then joins its
items to articles for SKU, name, and unit. Items are sorted by item ID. Price
comes from the order item, not the article's current catalog price.

Returns 404 if the order is missing. An existing order without items returns `[]`.

```json
[
  {
    "id": 1,
    "sku": "OAK-ENG-14",
    "article_name": "Engineered oak flooring, 14 mm",
    "unit": "m²",
    "quantity": "40.500",
    "unit_price": "550.00",
    "line_total": "22275.00"
  },
  {
    "id": 2,
    "sku": "ADH-WOOD-15",
    "article_name": "Wood flooring adhesive, 15 kg bucket",
    "unit": "pcs",
    "quantity": "3.000",
    "unit_price": "700.00",
    "line_total": "2100.00"
  },
  {
    "id": 3,
    "sku": "SKIRT-WHITE-24",
    "article_name": "White skirting board, 2.4 m length",
    "unit": "pcs",
    "quantity": "18.000",
    "unit_price": "119.00",
    "line_total": "2142.00"
  },
  {
    "id": 4,
    "sku": "LAB-INSTALL",
    "article_name": "Flooring installation labor",
    "unit": "hours",
    "quantity": "16.000",
    "unit_price": "600.00",
    "line_total": "9600.00"
  }
]
```

## Validation and error responses

Route IDs must contain only decimal digits and represent a value from 1 through
2147483647 (PostgreSQL `INTEGER` maximum). Leading zeros are accepted; signs,
fractions, whitespace, scientific notation, and larger values are rejected
before querying the database. Conversion to JavaScript `Number` is used only
for ID validation, never monetary values.

All API errors have one `error` field:

| Situation | HTTP status | JSON body |
| --- | --- | --- |
| Invalid ID | 400 | `{"error":"ID must be a positive integer between 1 and 2147483647."}` |
| Malformed URL encoding | 400 | `{"error":"Invalid URL encoding."}` |
| Missing customer | 404 | `{"error":"Customer not found."}` |
| Missing order | 404 | `{"error":"Order not found."}` |
| Unknown route or unimplemented write method | 404 | `{"error":"Route not found."}` |
| Unexpected database/server error | 500 | `{"error":"Internal server error."}` |

Unexpected errors are logged on the server. The response contains no raw SQL,
credentials, connection details, or stack trace. The existing `/health` endpoint
retains its M1 contract, including HTTP 503 for database unavailability.

## Calculation rules and technical choices

Line total:

```sql
ROUND(oi.quantity * oi.unit_price, 2)
```

Order total:

```sql
COALESCE(SUM(ROUND(oi.quantity * oi.unit_price, 2)), 0.00)
```

Both operations use PostgreSQL `NUMERIC`. `COALESCE` returns `0.00` when the sum
is null. The driver returns numeric values as strings, which are passed directly
to JSON. No monetary calculation uses JavaScript floating-point numbers.

Rounding happens **before** summing. Four lines worth `0.005` each become four
`0.01` lines, giving an order total of `0.04`, rather than `0.02`. PostgreSQL
numeric rounding breaks half-value ties away from zero. Tests check this case
and totals larger than JavaScript's exact integer range.

Unlike C# `decimal`, JavaScript's built-in `Number` cannot preserve arbitrary
decimal money values. Keeping the calculations in PostgreSQL and returning
strings preserves the result without adding a decimal arithmetic dependency.

Displayed totals include all items regardless of order status. Future sales
reports must filter to `completed`; these browsing endpoints are not sales
reports. Historical item prices are used even when catalog prices change.

All input IDs use `$1` SQL parameters. Explicit column lists avoid exposing
unneeded fields. No pagination, writes, ORM, service layer, or new dependency
is introduced. Express 5 forwards rejected async handlers to the final error
middleware, so individual routes do not repeat `try`/`catch` blocks.

References: [Express error handling](https://expressjs.com/en/guide/error-handling/),
[node-postgres parameterized queries](https://node-postgres.com/features/queries),
and [PostgreSQL numeric rounding](https://www.postgresql.org/docs/18/functions-math.html).
