#!/bin/sh
# OpenTrade API container entrypoint (ADR-0056).
#
# Composes DATABASE_URL from discrete parts when it is not already set, making
# the RDS-managed master secret the single source of truth: ECS injects
# DB_PASSWORD from that secret's `password` JSON key, while DB_USERNAME /
# DB_HOST / DB_PORT / DB_NAME are plain (non-secret) task env. The password is
# URL-encoded so a rotated password containing reserved characters never breaks
# connection-string parsing.
#
# Any caller that already exports a full DATABASE_URL (local dev via .env, or a
# legacy task definition mid-rollout) short-circuits this branch, so the
# entrypoint is backward compatible.
set -e

if [ -z "${DATABASE_URL:-}" ] && [ -n "${DB_PASSWORD:-}" ]; then
  DATABASE_URL="$(node -e '
    const enc = encodeURIComponent;
    const user = enc(process.env.DB_USERNAME || "");
    const pass = enc(process.env.DB_PASSWORD || "");
    const host = process.env.DB_HOST || "";
    const port = process.env.DB_PORT || "5432";
    const name = process.env.DB_NAME || "";
    process.stdout.write(
      `postgresql://${user}:${pass}@${host}:${port}/${name}?sslmode=require&uselibpqcompat=true`,
    );
  ')"
  export DATABASE_URL
fi

exec "$@"
