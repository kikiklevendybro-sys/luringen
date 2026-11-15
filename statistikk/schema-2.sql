-- rusj-statistikk, version 2: monthly totals, so the dashboard can show long periods cheaply.
--
-- One row per (month, counter name). `maned` is the calendar month in Norway, "2026-11". `n` is
-- the sum of that name's daily counters in table teller for the whole month. The rows are written
-- only by the Worker's nightly job (src/index.js, rullOpp) from teller, once a month is over, and
-- never by the phones. Like teller there is no column for a person, a phone, an address, a time of
-- day or free text. Rows older than 25 months are deleted by the same nightly job.
--
-- Apply (safe to run more than once; schema.sql must have been run first):
--   npx --yes wrangler@4.160.0 d1 execute rusj-statistikk --remote --file=schema-2.sql
CREATE TABLE IF NOT EXISTS maned (
  maned  TEXT    NOT NULL CHECK (maned GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  nokkel TEXT    NOT NULL CHECK (length(nokkel) BETWEEN 1 AND 40),
  n      INTEGER NOT NULL CHECK (n > 0),
  PRIMARY KEY (maned, nokkel)
) WITHOUT ROWID;
