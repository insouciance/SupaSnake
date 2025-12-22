#!/bin/bash
# Run SQL on Supabase database
# Usage: ./scripts/run_sql.sh "SELECT * FROM players"
# Or:    ./scripts/run_sql.sh < migration.sql

DB_URL="postgresql://postgres:d1g4Dig1%21_4@db.ycarqqbdmcbcnnaozmcu.supabase.co:6543/postgres"
PSQL="/opt/homebrew/opt/postgresql@14/bin/psql"

if [ -t 0 ]; then
  # Input from argument
  $PSQL "$DB_URL" -c "$1"
else
  # Input from stdin
  $PSQL "$DB_URL"
fi
