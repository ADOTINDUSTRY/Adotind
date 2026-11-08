-- A Dot SVG Trace — Database migration 001 (initial schema)
-- Apply:  mysql -u <user> -p <db_name> < svg-trace/migrations/001_initial.sql
-- Rollback: see svg-trace/migrations/001_initial_rollback.sql
--
-- Isolation rules:
--  * Runs in its own database (recommended: a NEW database, e.g. uXXXX_svgtrace).
--  * Every table uses the st_ prefix and never references business ERP tables.
--  * All timestamps are UTC. Files live on private disk; MySQL stores metadata only.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE st_users (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id       CHAR(26)     NOT NULL,               -- ULID, used in URLs/exports
    email           VARCHAR(190) NOT NULL,               -- lowercase, unique
    display_name    VARCHAR(120) NOT NULL DEFAULT '',
    avatar_url      VARCHAR(500) NULL,
    status          ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
    is_admin        TINYINT(1)   NOT NULL DEFAULT 0,
    email_verified_at DATETIME   NULL,
    last_login_at   DATETIME     NULL,
    deleted_at      DATETIME     NULL,
    created_at      DATETIME     NOT NULL,
    updated_at      DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_st_users_email (email),
    UNIQUE KEY uq_st_users_public_id (public_id),
    KEY ix_st_users_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_user_auth_providers (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id       BIGINT UNSIGNED NOT NULL,
    provider      ENUM('google','facebook','email') NOT NULL,
    provider_uid  VARCHAR(190) NOT NULL,                -- sub from provider, or email for passwordless
    created_at    DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_st_provider_uid (provider, provider_uid),
    KEY ix_st_providers_user (user_id),
    CONSTRAINT fk_st_providers_user FOREIGN KEY (user_id)
        REFERENCES st_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_magic_login_tokens (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email         VARCHAR(190) NOT NULL,
    token_hash    CHAR(64) NOT NULL,                    -- sha256 of token, token itself never stored
    expires_at    DATETIME NOT NULL,
    consumed_at   DATETIME NULL,
    ip            VARBINARY(16) NULL,
    created_at    DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_st_magic_email (email),
    KEY ix_st_magic_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_sessions (
    id            CHAR(64) NOT NULL,                    -- sha256 of the cookie value
    user_id       BIGINT UNSIGNED NOT NULL,
    ip            VARBINARY(16) NULL,
    user_agent    VARCHAR(255) NULL,
    expires_at    DATETIME NOT NULL,
    created_at    DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_st_sessions_user (user_id),
    KEY ix_st_sessions_expires (expires_at),
    CONSTRAINT fk_st_sessions_user FOREIGN KEY (user_id)
        REFERENCES st_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_projects (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id       BIGINT UNSIGNED NOT NULL,
    title         VARCHAR(190) NOT NULL DEFAULT 'Untitled project',
    status        ENUM('active','deleted') NOT NULL DEFAULT 'active',
    deleted_at    DATETIME NULL,
    created_at    DATETIME NOT NULL,
    updated_at    DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_st_projects_user (user_id, status),
    CONSTRAINT fk_st_projects_user FOREIGN KEY (user_id)
        REFERENCES st_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_files (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id       BIGINT UNSIGNED NOT NULL,
    project_id    BIGINT UNSIGNED NOT NULL,
    kind          ENUM('original','output','preview','export') NOT NULL,
    format        VARCHAR(10) NOT NULL,                 -- png, jpg, svg, pdf, dxf...
    stored_name   CHAR(40) NOT NULL,                    -- random filename on private disk
    original_name VARCHAR(255) NOT NULL DEFAULT '',
    size_bytes    BIGINT UNSIGNED NOT NULL DEFAULT 0,
    width         INT UNSIGNED NULL,
    height        INT UNSIGNED NULL,
    sha256        CHAR(64) NULL,
    expires_at    DATETIME NOT NULL,                    -- 30-day retention
    deleted_at    DATETIME NULL,                        -- physical deletion timestamp
    created_at    DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_st_files_stored (stored_name),
    KEY ix_st_files_project (project_id),
    KEY ix_st_files_user (user_id),
    KEY ix_st_files_expiry (deleted_at, expires_at),
    CONSTRAINT fk_st_files_project FOREIGN KEY (project_id)
        REFERENCES st_projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_st_files_user FOREIGN KEY (user_id)
        REFERENCES st_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_jobs (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         BIGINT UNSIGNED NOT NULL,
    project_id      BIGINT UNSIGNED NOT NULL,
    input_file_id   BIGINT UNSIGNED NOT NULL,
    output_file_id  BIGINT UNSIGNED NULL,
    engine          VARCHAR(40) NOT NULL,               -- vtracer-color, vtracer-bw, centreline...
    settings_json   JSON NOT NULL,                      -- full reproducible settings
    input_sha256    CHAR(64) NOT NULL,                  -- duplicate-job prevention
    status          ENUM('pending','queued','processing','completed','failed','cancelled')
                    NOT NULL DEFAULT 'queued',
    attempts        TINYINT UNSIGNED NOT NULL DEFAULT 0,
    max_attempts    TINYINT UNSIGNED NOT NULL DEFAULT 2,
    priority        TINYINT NOT NULL DEFAULT 0,
    lock_token      CHAR(64) NULL,                      -- worker claim token (hex sha256)
    locked_until    DATETIME NULL,
    error_message   TEXT NULL,
    queued_at       DATETIME NOT NULL,
    started_at      DATETIME NULL,
    finished_at     DATETIME NULL,
    duration_ms     INT UNSIGNED NULL,
    created_at      DATETIME NOT NULL,
    updated_at      DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_st_jobs_claim (status, priority, id),
    KEY ix_st_jobs_user (user_id, created_at),
    KEY ix_st_jobs_lock (status, locked_until),
    CONSTRAINT fk_st_jobs_user FOREIGN KEY (user_id)
        REFERENCES st_users (id) ON DELETE CASCADE,
    CONSTRAINT fk_st_jobs_project FOREIGN KEY (project_id)
        REFERENCES st_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- NOTE: duplicate prevention is enforced in application code with
-- SELECT ... FOR UPDATE inside a transaction (a plain unique key would block
-- legitimate re-traces of the same input with different settings).

CREATE TABLE st_exports (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_id        BIGINT UNSIGNED NOT NULL,
    file_id       BIGINT UNSIGNED NOT NULL,
    format        ENUM('svg','png','pdf','dxf') NOT NULL,
    settings_json JSON NULL,
    created_at    DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_st_exports_job (job_id),
    CONSTRAINT fk_st_exports_job FOREIGN KEY (job_id)
        REFERENCES st_jobs (id) ON DELETE CASCADE,
    CONSTRAINT fk_st_exports_file FOREIGN KEY (file_id)
        REFERENCES st_files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_usage_events (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NULL,
    event       VARCHAR(50) NOT NULL,                   -- register, login, upload, conversion_started...
    meta_json   JSON NULL,                              -- never contains secrets or file contents
    ip          VARBINARY(16) NULL,
    created_at  DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_st_events_user (user_id, created_at),
    KEY ix_st_events_type (event, created_at),
    CONSTRAINT fk_st_events_user FOREIGN KEY (user_id)
        REFERENCES st_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_user_daily_usage (
    user_id       BIGINT UNSIGNED NOT NULL,
    day           DATE NOT NULL,                        -- UTC date
    conversions   INT UNSIGNED NOT NULL DEFAULT 0,
    uploads_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    cpu_ms        BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day),
    CONSTRAINT fk_st_daily_user FOREIGN KEY (user_id)
        REFERENCES st_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_admin_audit_logs (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_id    BIGINT UNSIGNED NOT NULL,
    action      VARCHAR(80) NOT NULL,
    target_type VARCHAR(40) NULL,
    target_id   BIGINT UNSIGNED NULL,
    meta_json   JSON NULL,
    ip          VARBINARY(16) NULL,
    created_at  DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_st_audit_admin (admin_id, created_at),
    CONSTRAINT fk_st_audit_admin FOREIGN KEY (admin_id)
        REFERENCES st_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_security_events (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NULL,
    email       VARCHAR(190) NULL,
    event       VARCHAR(60) NOT NULL,                   -- login_failed, rate_limited, upload_rejected...
    meta_json   JSON NULL,
    ip          VARBINARY(16) NULL,
    created_at  DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_st_sec_event (event, created_at),
    KEY ix_st_sec_email (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_cost_inputs (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    label       VARCHAR(120) NOT NULL,                  -- "Shared hosting monthly", "Storage per GB"...
    kind        ENUM('monthly_fixed','per_gb_storage','per_gb_bandwidth','per_conversion','other') NOT NULL,
    amount      DECIMAL(12,4) NOT NULL,                 -- money in EUR, clearly labelled as admin estimate
    currency    CHAR(3) NOT NULL DEFAULT 'EUR',
    effective_from DATE NOT NULL,
    created_at  DATETIME NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE st_system_settings (
    `key`       VARCHAR(80) NOT NULL,
    value_json  JSON NOT NULL,
    updated_by  BIGINT UNSIGNED NULL,
    updated_at  DATETIME NOT NULL,
    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default limits (admin-editable; enforced in the backend).
INSERT INTO st_system_settings (`key`, value_json, updated_at) VALUES
 ('upload',      JSON_OBJECT('max_bytes', 1073741824, 'max_dimension_px', 30000,
                 'allowed_formats', JSON_ARRAY()), UTC_TIMESTAMP()),
 ('limits',      JSON_OBJECT('daily_conversions', 50, 'concurrent_jobs', 1,
                 'storage_mb_per_user', 500), UTC_TIMESTAMP()),
 ('worker',      JSON_OBJECT('job_timeout_seconds', 120, 'concurrency', 1,
                 'memory_limit_mb', 768), UTC_TIMESTAMP()),
 ('retention',   JSON_OBJECT('days', 30), UTC_TIMESTAMP()),
 ('maintenance', JSON_OBJECT('enabled', 0), UTC_TIMESTAMP());
