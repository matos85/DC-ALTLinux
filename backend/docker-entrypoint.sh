#!/bin/sh
set -e
cd /app

# Worker: не выполняем migrate/purge от имени воркера.
if [ "$1" = "celery" ]; then
  exec "$@"
fi

python manage.py migrate
if [ "${PANEL_PURGE_DOMAIN_ON_STARTUP:-0}" = "1" ]; then
  python manage.py purge_panel_data
fi
python manage.py ensure_panel_admin
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000
