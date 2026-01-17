#!/bin/bash

# Initialize PostgreSQL database for SIP Meetings

set -e

echo "Initializing database..."

# Wait for PostgreSQL to be ready
until pg_isready -h localhost -p 5432 -U postgres; do
  echo "Waiting for PostgreSQL..."
  sleep 2
done

# Create database if not exists
psql -h localhost -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'sip_meetings'" | grep -q 1 || \
  psql -h localhost -U postgres -c "CREATE DATABASE sip_meetings"

# Run schema
psql -h localhost -U postgres -d sip_meetings -f ../backend/src/store/schema.sql

echo "Database initialized successfully!"
