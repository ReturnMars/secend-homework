-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Create import_batches table
CREATE TABLE IF NOT EXISTS import_batches (
    id BIGSERIAL PRIMARY KEY,
    original_filename VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Pending',
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_by ON import_batches(created_by);
CREATE INDEX IF NOT EXISTS idx_import_batches_deleted_at ON import_batches(deleted_at);

-- Create records table
CREATE TABLE IF NOT EXISTS records (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    row_index INTEGER,
    name VARCHAR(255),
    phone VARCHAR(50),
    date VARCHAR(50),
    address VARCHAR(255),
    province VARCHAR(100),
    city VARCHAR(100),
    district VARCHAR(100),
    status VARCHAR(50),
    error_message TEXT,
    raw_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_records_batch_id ON records(batch_id);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);

-- Create record_versions table
CREATE TABLE IF NOT EXISTS record_versions (
    id BIGSERIAL PRIMARY KEY,
    record_id BIGINT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_record_versions_record_id ON record_versions(record_id);
