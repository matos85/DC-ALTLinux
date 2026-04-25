Domain Agent — компонент панели управления Samba AD.

После install.sh:
  cd /opt/domain-agent && ./venv/bin/python -m domain_agent setup

На сервере с ролью DC должны быть доступны samba-tool, ldbsearch (пакеты Samba AD).
Порт по умолчанию: 8090 (переменная AGENT_PORT при установке).

Скачивание с панели (подставьте URL и токен из раздела «Серверы»):
  curl -fsSL 'http://ПАНЕЛЬ:3000/api/backend/agent/bundle/?token=СЕКРЕТ' -o domain-agent.tgz
  tar xzf domain-agent.tgz && sudo ./install.sh

Ввод рабочей станции в домен (интерактивный скрипт, не от root):
  curl -fsSL 'http://ПАНЕЛЬ:3000/api/backend/agent/join-workstation.sh/?token=СЕКРЕТ' -o join-workstation.sh
  chmod +x join-workstation.sh && ./join-workstation.sh
