BEGIN;

DROP TRIGGER IF EXISTS customer_set_updated_at ON customer;
DROP FUNCTION IF EXISTS set_updated_at();
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS customer;

COMMIT;
