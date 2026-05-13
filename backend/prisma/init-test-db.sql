-- Runs once when the Postgres container is first initialized.
-- Creates a second logical database for the test harness so tests
-- never touch dev data.
CREATE DATABASE bistro_test OWNER bistro;
