-- rusj-statistikk: the whole database is this one table.
--
-- One row per (day, counter name). `dag` is the calendar day in Norway, "2026-11-11".
-- `nokkel` is a counter name from the grammar in src/nokler.js, for example "side.ordugla" or
-- "enhet.igar". `n` is how many times it was reported that day.
--
-- There is no column for a person, a phone, an address, a time of day or free text, so none of
-- that can be stored. Rows older than 25 months are deleted by the Worker's scheduled job.
--
-- Apply (safe to run more than once):
--   npx wrangler d1 execute rusj-statistikk --remote --file=schema.sql
--
-- Migrations: this file is version 1 and there is no migration table (the database should hold
-- nothing but counters). A later change gets its own file (schema-2.sql, …) that is written so it
-- can be run twice without harm, is applied with the same command, and is listed in README.md.
CREATE TABLE IF NOT EXISTS teller (
  dag    TEXT    NOT NULL CHECK (dag GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  nokkel TEXT    NOT NULL CHECK (length(nokkel) BETWEEN 1 AND 40),
  n      INTEGER NOT NULL CHECK (n > 0),
  PRIMARY KEY (dag, nokkel)
) WITHOUT ROWID;
