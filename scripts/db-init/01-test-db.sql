-- Runs once, when the database volume is first created.
CREATE DATABASE crown_test OWNER crown;
\connect crown
CREATE EXTENSION IF NOT EXISTS vector;
\connect crown_test
CREATE EXTENSION IF NOT EXISTS vector;
