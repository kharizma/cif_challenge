-- Keep the normalised NIK so the customer table can show it; matching still normalises on input.
ALTER TABLE customer ADD COLUMN nik varchar(16);

ALTER TABLE customer ADD CONSTRAINT customer_nik_format
    CHECK (nik IS NULL OR nik ~ '^[0-9]{16}$');
