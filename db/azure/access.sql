-- Run as floorflow_admin, after the unchanged schema and seed, in the same transaction.
-- NOLOGIN until verification succeeds and the saved passwords are attached.
CREATE ROLE floorflow_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
    NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10;
CREATE ROLE floorflow_ai NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
    NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;

REVOKE ALL ON DATABASE floorflow FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, floorflow_app, floorflow_ai;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, floorflow_app, floorflow_ai;
GRANT CONNECT ON DATABASE floorflow TO floorflow_app, floorflow_ai;
GRANT USAGE ON SCHEMA public TO floorflow_app, floorflow_ai;
GRANT SELECT ON public.customers, public.orders, public.articles, public.order_items
    TO floorflow_app, floorflow_ai;

-- These are login defaults, not a substitute for the ACLs above.
ALTER ROLE floorflow_app SET default_transaction_read_only = on;
ALTER ROLE floorflow_app SET search_path = public, pg_catalog;
ALTER ROLE floorflow_app SET statement_timeout = '3s';
ALTER ROLE floorflow_app SET lock_timeout = '500ms';
ALTER ROLE floorflow_app SET idle_in_transaction_session_timeout = '5s';
ALTER ROLE floorflow_app SET transaction_timeout = '5s';
ALTER ROLE floorflow_app SET work_mem = '4MB';

ALTER ROLE floorflow_ai SET default_transaction_read_only = on;
ALTER ROLE floorflow_ai SET search_path = pg_catalog;
ALTER ROLE floorflow_ai SET statement_timeout = '2s';
ALTER ROLE floorflow_ai SET lock_timeout = '500ms';
ALTER ROLE floorflow_ai SET idle_in_transaction_session_timeout = '5s';
ALTER ROLE floorflow_ai SET transaction_timeout = '5s';
ALTER ROLE floorflow_ai SET work_mem = '4MB';

-- temp_file_limit is inherited from the existing 8192 kB server setting.
-- No role memberships, parameter privileges or automatic future SELECT grants.
