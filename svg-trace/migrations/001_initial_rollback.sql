-- A Dot SVG Trace — Rollback for migration 001.
-- Run ONLY if you intentionally want to remove the whole application schema.
-- This deletes every st_ table and all their rows. Files on disk are NOT
-- touched by this script (clean them separately after verification).

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS
    st_system_settings,
    st_cost_inputs,
    st_security_events,
    st_admin_audit_logs,
    st_user_daily_usage,
    st_usage_events,
    st_exports,
    st_jobs,
    st_files,
    st_projects,
    st_sessions,
    st_magic_login_tokens,
    st_user_auth_providers,
    st_users;
SET FOREIGN_KEY_CHECKS = 1;
