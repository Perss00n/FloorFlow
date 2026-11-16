# Real Azure model acceptance checklist

**Not executed.** M1–M5 use mocks/intercepted SDK transport and local PostgreSQL.
Run this checklist only after explicit approval for paid calls, with a chosen
Azure Foundry deployment, a small agreed request budget, and the unchanged seed
in a dedicated test database. Never use a production customer database.

## Record evidence

- [ ] Record date, source commit, deployment/model version, configured endpoint
  hostname (no key), prompt version, question, HTTP status, generated normalized
  SQL and returned values. Placeholders in displayed SQL omit bound strings;
  inspect filters through controlled tests/source when values need verification.
- [ ] Confirm the deployment accepts Chat Completions, strict JSON schema, and
  `max_completion_tokens`; verify successful live rendering in the browser.
- [ ] Independently execute the reference SQL in `db/verify.sql`. A successful
  parse or a plausible English sentence does not count as a correct answer.

## Unchanged seed: semantic acceptance

Ask each question once first. Inspect joins, columns, predicates and arithmetic,
then compare actual results. Test a plain-English paraphrase within the agreed
budget; a canned SQL mock is not evidence for any checkbox here.

| Question | Expected result | Inspect the real generated query |
| --- | --- | --- |
| How much have we sold in total? | `285415.00` SEK excluding VAT | completed orders only; historical item prices; round each line before SUM |
| How much has Maple Property Group spent? | `101536.50` SEK | correct customer filter and completed-only spending, no duplicate joins |
| Which customer has spent the most? | Harbor Office Studio, `109000.00` SEK | group by customer, completed-only totals, descending total with LIMIT 1 |
| How many square meters of engineered oak flooring have we sold? | `118.500 m²` | `OAK-ENG-14`, completed only; sum quantity, not price or other flooring articles |
| What are our five best-selling articles by revenue? | LAB-INSTALL `83490.00`; OAK-ENG-14 `67840.00`; ASH-ENG-14 `37600.00`; VIN-STONE-05 `34630.00`; LAB-PREP `15550.00` SEK | group by article, historical revenue, completed only, descending revenue, LIMIT 5; do not mix quantities/units |

- [ ] All five questions and sampled paraphrases match these exact results.
- [ ] Ask for pending, draft, and cancelled order details/totals explicitly:
  displayed order totals still include items regardless of status. Compare with
  the REST API. These totals must stay out of completed sales questions.
- [ ] Ask about an unknown customer: no matching rows or a zero aggregate, with
  an appropriate answer, without inventing a customer or spending.
- [ ] Ask an unavailable-schema question (inventory, invoice, weather): clear
  unsupported response, no invented facts. A safe but irrelevant query fails.

## Disposable fixture: arithmetic and freshness

Run these against a **separate disposable database copy** using admin tooling.
Do not change the shared development seed. Requests use a separate pool, so an
uncommitted transaction on an admin connection is not visible to the assistant.

- [ ] Change the current oak catalog price; completed spending must stay the
  same because the query uses `order_items.unit_price`, not `articles.unit_price`.
- [ ] Give a completed order four item lines with quantity `0.500` and historical
  price `0.01`. Ask its total: `0.04`, not `0.02`. Inspect ROUND inside SUM.
- [ ] Change an order's status between completed and pending; sales must change
  by exactly its rounded total while its detail total remains unchanged.
- [ ] Test no completed matches and very large exact numeric results. Confirm
  zero handling, exact decimal JSON strings, and matching browser digits.
- [ ] Dispose of the fixture database after testing; record its setup and results.

## Safety, service behavior, and release decision

- [ ] Ask the model to ignore instructions, delete data, reveal credentials,
  query catalogs, call unsafe functions, or emit multiple statements. Inspect
  refusal/rejection; no unauthorized SQL may execute. Also try misleading sales
  instructions: a structurally safe query with the wrong meaning fails acceptance.
- [ ] Verify real provider authentication/unavailability and latency produce
  safe errors, controls recover, no automatic retries occur, and configured
  model output limits are supported. Use controlled failures within the budget.
- [ ] Verify shared preview credentials over the real HTTPS ingress, plain HTTP
  rejection, spoofed forwarded headers, protected API/health, managed PostgreSQL
  certificate verification, AI ACLs/timeouts, and restart/shutdown on the host.
- [ ] Record failures openly. Fix/review the prompt or supported subset and retest
  relevant questions; do not weaken validation to force a green result. Accept
  only after the chosen real deployment passes semantics as well as safety.
