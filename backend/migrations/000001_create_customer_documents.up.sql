-- CIF schema. cif_cache is a Redis key (TTL), so it has no SQL migration.
BEGIN;

CREATE TABLE customer (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      varchar(17) UNIQUE,
    full_name           varchar(100) NOT NULL,
    dob                 date NOT NULL,
    phone               varchar(15),
    marital_status      varchar(15) NOT NULL,
    spouse_forgotten    boolean DEFAULT false,
    spouse_name         varchar(50),
    loan_type           varchar(50) NOT NULL,
    loan_amount         bigint NOT NULL,
    loan_tenor_months   integer NOT NULL,
    decision            varchar(100),
    reason              varchar(100),
    identity_confidence numeric,
    credit_score        numeric,
    matched_no_cif      varchar(100),
    status              varchar(15),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT customer_full_name_length CHECK (char_length(full_name) BETWEEN 3 AND 100),
    CONSTRAINT customer_full_name_charset CHECK (full_name ~ '^[A-Za-z .,''-]+$'),
    CONSTRAINT customer_dob_not_future CHECK (dob <= CURRENT_DATE),
    CONSTRAINT customer_phone_format CHECK (
        phone IS NULL
        OR regexp_replace(phone, '[ -]', '', 'g') ~ '^(\+628|628|08)[0-9]{8,11}$'
    ),
    CONSTRAINT customer_marital_status CHECK (marital_status IN ('BELUM_KAWIN', 'KAWIN', 'CERAI')),
    CONSTRAINT customer_spouse_forgotten_clears_name CHECK (
        spouse_forgotten IS NOT TRUE OR spouse_name IS NULL OR btrim(spouse_name) = ''
    ),
    CONSTRAINT customer_spouse_name_requires_kawin CHECK (
        spouse_name IS NULL OR marital_status = 'KAWIN'
    ),
    CONSTRAINT customer_spouse_name_charset CHECK (
        spouse_name IS NULL OR spouse_name ~ '^[A-Za-z .,''-]+$'
    ),
    CONSTRAINT customer_loan_type CHECK (loan_type IN ('KTA', 'KPR', 'KKB', 'MODAL_KERJA')),
    CONSTRAINT customer_loan_amount_range CHECK (loan_amount BETWEEN 5000000 AND 500000000),
    CONSTRAINT customer_loan_tenor CHECK (loan_tenor_months IN (6, 12, 24, 36, 48, 60)),
    CONSTRAINT customer_status CHECK (status IS NULL OR status IN ('NOT PASS', 'PASS', 'REFER'))
);

CREATE INDEX idx_customer_application_id ON customer (application_id);
CREATE INDEX idx_customer_matched_no_cif ON customer (matched_no_cif);

CREATE TABLE documents (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id varchar(17),
    file_name      varchar(255) NOT NULL,
    doc_type       varchar(20) NOT NULL,
    file_type      varchar(5) NOT NULL,
    size           integer NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT documents_application_fk FOREIGN KEY (application_id)
        REFERENCES customer (application_id) ON DELETE CASCADE,
    CONSTRAINT documents_doc_type CHECK (
        doc_type IN ('KTP', 'NPWP', 'SLIP_GAJI', 'BUKU_NIKAH', 'LAINNYA')
    ),
    CONSTRAINT documents_file_type CHECK (file_type IN ('jpg', 'jpeg', 'png', 'pdf')),
    CONSTRAINT documents_size CHECK (size > 0 AND size <= 20971520)
);

CREATE INDEX idx_documents_application_id ON documents (application_id);

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER customer_set_updated_at
    BEFORE UPDATE ON customer
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
