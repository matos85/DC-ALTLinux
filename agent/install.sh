#!/bin/sh
# Установка domain-agent на ALT Linux / другой хост с systemd.
# Запуск: после распаковки архива — sudo ./install.sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/domain-agent}"
PORT="${AGENT_PORT:-8090}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите от root: sudo $0" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Нужен python3. Пример для ALT: apt-get install -y python3 python3-venv" >&2
  exit 1
fi

mkdir -p "$INSTALL_ROOT"
cp -a "$ROOT/domain_agent" "$ROOT/requirements.txt" "$INSTALL_ROOT/"
if [ -f "$ROOT/README.agent.txt" ]; then
  cp -a "$ROOT/README.agent.txt" "$INSTALL_ROOT/"
fi

python3 -m venv "$INSTALL_ROOT/venv"
"$INSTALL_ROOT/venv/bin/pip" install -q -U pip wheel
"$INSTALL_ROOT/venv/bin/pip" install -q -r "$INSTALL_ROOT/requirements.txt"

# Опциональный файл окружения (создаётся мастером setup).
touch "$INSTALL_ROOT/agent.env"
chmod 600 "$INSTALL_ROOT/agent.env"

UNIT_PATH="/etc/systemd/system/domain-agent.service"
cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Domain Admin Panel Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_ROOT
Environment=PYTHONPATH=$INSTALL_ROOT
EnvironmentFile=-$INSTALL_ROOT/agent.env
ExecStart=$INSTALL_ROOT/venv/bin/uvicorn domain_agent.main:app --host 0.0.0.0 --port $PORT
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable domain-agent.service

echo ""
echo "Агент установлен в $INSTALL_ROOT"
echo "Далее:"
echo "  1) $INSTALL_ROOT/venv/bin/python -m domain_agent setup"
echo "  2) systemctl start domain-agent.service"
echo "  3) В панели добавьте сервер с base_url http://$(hostname -I 2>/dev/null | awk '{print $1; exit}' || echo 'ЭТОТ_ХОСТ'):$PORT"
echo ""
