#!/bin/sh
set -eu
# Solo corre en el primer init del volumen Postgres (socket Unix local).
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@/${POSTGRES_DB}?host=/var/run/postgresql"
sh /sql/selfhost/apply.sh
