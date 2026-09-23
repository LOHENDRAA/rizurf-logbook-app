#!/bin/sh
# Container boot: ensure an APP_KEY exists, then migrate and serve.
set -e
cd /var/www

if [ -z "${APP_KEY:-}" ]; then
    echo "APP_KEY is empty; generating an ephemeral key (set APP_KEY in .env for stable cookies/sessions)."
    export APP_KEY
    APP_KEY="$(php artisan key:generate --show)"
fi

php artisan migrate --force

exec "$@"
