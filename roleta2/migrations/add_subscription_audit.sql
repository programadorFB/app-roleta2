CREATE TABLE IF NOT EXISTS subscription_audit (
  id           SERIAL PRIMARY KEY,
  user_id      VARCHAR NOT NULL,
  email        VARCHAR NOT NULL,
  from_status  VARCHAR,
  to_status    VARCHAR NOT NULL,
  triggered_by VARCHAR NOT NULL DEFAULT 'webhook',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_audit_email      ON subscription_audit (email);
CREATE INDEX IF NOT EXISTS idx_sub_audit_created_at ON subscription_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_audit_user_id    ON subscription_audit (user_id);
