-- Schema zabbix.* para sync local (worker alleone-zabbix-sync).
-- Idempotente: seguro rodar em ambientes onde o prisma db push já criou as tabelas.

CREATE SCHEMA IF NOT EXISTS zabbix;

CREATE TABLE IF NOT EXISTS zabbix.host_groups (
  groupid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zabbix.hosts (
  hostid TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT,
  maintenance_status TEXT,
  raw_json JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zabbix.host_group_members (
  groupid TEXT NOT NULL REFERENCES zabbix.host_groups(groupid) ON DELETE CASCADE,
  hostid TEXT NOT NULL REFERENCES zabbix.hosts(hostid) ON DELETE CASCADE,
  PRIMARY KEY (groupid, hostid)
);

CREATE TABLE IF NOT EXISTS zabbix.problem_events (
  eventid BIGINT PRIMARY KEY,
  groupid TEXT NOT NULL REFERENCES zabbix.host_groups(groupid) ON DELETE CASCADE,
  hostid TEXT,
  host_name TEXT,
  objectid TEXT,
  clock TIMESTAMPTZ NOT NULL,
  name TEXT,
  severity SMALLINT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zabbix_problem_events_group_clock
  ON zabbix.problem_events (groupid, clock);

CREATE INDEX IF NOT EXISTS idx_zabbix_problem_events_group_host_sev
  ON zabbix.problem_events (groupid, hostid, severity, clock);

CREATE TABLE IF NOT EXISTS zabbix.monthly_host_stats (
  groupid TEXT NOT NULL REFERENCES zabbix.host_groups(groupid) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  hostid TEXT NOT NULL,
  host_name TEXT NOT NULL,
  high_count INT NOT NULL DEFAULT 0,
  disaster_count INT NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (groupid, month_key, hostid)
);

CREATE TABLE IF NOT EXISTS zabbix.sync_state (
  groupid TEXT PRIMARY KEY REFERENCES zabbix.host_groups(groupid) ON DELETE CASCADE,
  last_eventid BIGINT,
  last_sync_at TIMESTAMPTZ,
  hosts_synced_at TIMESTAMPTZ,
  backfill_from TIMESTAMPTZ,
  backfill_done BOOLEAN NOT NULL DEFAULT false
);
