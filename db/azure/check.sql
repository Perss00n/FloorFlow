-- Run on postgres inside BEGIN READ ONLY. Never read pg_authid/password hashes.
SELECT current_user,
       current_setting('server_version_num')::integer AS version,
       r.rolcreatedb AND r.rolcreaterole AND NOT r.rolsuper AS suitable_admin,
       current_setting('transaction_read_only') AS read_only,
       EXISTS (SELECT FROM pg_catalog.pg_database WHERE datname = 'floorflow') AS database_exists,
       EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'floorflow_owner') AS owner_exists,
       EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'floorflow_app') AS app_exists,
       EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'floorflow_ai') AS ai_exists,
       EXISTS (
           SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'
           UNION ALL
           SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
           UNION ALL
           SELECT FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public'
       ) AS public_objects_exist
FROM pg_catalog.pg_roles r WHERE r.rolname = current_user;
