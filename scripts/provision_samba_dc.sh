#!/usr/bin/env bash
#
# Первичное развёртывание контроллера домена Samba AD на «чистом» сервере (ALT / Debian-подобные / RHEL-подобные).
# Запуск только от root на машине, которая станет DC.
#
# С панели:
#   curl -fsSL 'http://ПАНЕЛЬ:3000/api/backend/agent/provision-dc.sh/?token=СЕКРЕТ' -o provision-dc.sh
#   chmod +x provision-dc.sh && sudo ./provision-dc.sh
#
set -euo pipefail

say() { printf '%s\n' "$*"; }
err() { printf '%s\n' "$*" >&2; }

if [[ "$(id -u)" -ne 0 ]]; then
  err "Запустите от root: sudo $0"
  exit 1
fi

say ""
say "═══════════════════════════════════════════════════════════════════"
say "  Развёртывание Samba AD (новый лес / новый домен)"
say "═══════════════════════════════════════════════════════════════════"
say ""
say "ВНИМАНИЕ: на уже настроенном DC или при существующем smb.conf это может сломать конфигурацию."
say "Делайте только на новой установке сервера или после бэкапа."
say ""
read -r -p "Продолжить? [y/N]: " GO
if [[ ! "${GO}" =~ ^[Yy]$ ]]; then
  say "Отменено."
  exit 0
fi

read -r -p "DNS-имя домена (например corp.local): " DOMAIN_DNS
DOMAIN_DNS="${DOMAIN_DNS//[[:space:]]/}"
read -r -p "Realm Kerberos (например CORP.LOCAL), обычно DNS в верхнем регистре: " REALM
REALM="${REALM//[[:space:]]/}"
REALM="${REALM^^}"
read -r -p "NetBIOS-имя домена (короткое, до 15 символов, например CORP): " NETBIOS
NETBIOS="${NETBIOS//[[:space:]]/}"
NETBIOS="${NETBIOS^^}"

if [[ -z "${DOMAIN_DNS}" || -z "${REALM}" || -z "${NETBIOS}" ]]; then
  err "Домен, realm и NetBIOS обязательны."
  exit 1
fi

say ""
say "Задайте пароль администратора домена (Directory) — минимальная сложность зависит от политики Samba."
read -r -s -p "Пароль: " ADMIN_PASS
say ""
read -r -s -p "Пароль ещё раз: " ADMIN_PASS2
say ""
if [[ "${ADMIN_PASS}" != "${ADMIN_PASS2}" ]]; then
  err "Пароли не совпадают."
  exit 1
fi
if [[ ${#ADMIN_PASS} -lt 7 ]]; then
  err "Слишком короткий пароль (нужно обычно ≥7 символов)."
  exit 1
fi

say ""
say "── Установка пакетов ──"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  if apt-cache show task-samba-dc >/dev/null 2>&1; then
    say "apt-get: task-samba-dc (ALT)"
    DEBIAN_FRONTEND=noninteractive apt-get install -y task-samba-dc || {
      err "Установка task-samba-dc не удалась."
      exit 1
    }
    DEBIAN_FRONTEND=noninteractive apt-get install -y dnsutils 2>/dev/null || apt-get install -y bind-utils 2>/dev/null || true
  else
    say "apt-get: samba-ad-dc krb5-user winbind libnss-winbind libpam-winbind"
    DEBIAN_FRONTEND=noninteractive apt-get install -y samba-ad-dc krb5-user winbind libnss-winbind libpam-winbind dnsutils || {
      err "Установка пакетов не удалась. На ALT обычно нужен пакет task-samba-dc."
      exit 1
    }
  fi
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y samba-dc krb5-workstation bind-utils || {
    err "Проверьте имена пакетов samba-dc / samba-ad-dc для вашей версии."
    exit 1
  }
else
  err "Нужен apt-get или dnf."
  exit 1
fi

for s in smb nmb krb5kdc slapd bind; do systemctl disable "$s" 2>/dev/null || true; systemctl stop "$s" 2>/dev/null || true; done
systemctl stop smbd 2>/dev/null || true
systemctl stop nmbd 2>/dev/null || true
systemctl stop winbind 2>/dev/null || true
systemctl stop samba-ad-dc 2>/dev/null || true
systemctl stop samba 2>/dev/null || true

if [[ -f /etc/samba/smb.conf ]]; then
  BK="/etc/samba/smb.conf.bak.$(date +%s)"
  say "Резервная копия smb.conf -> ${BK}"
  cp -a /etc/samba/smb.conf "${BK}"
fi

say ""
say "── samba-tool domain provision ──"
export SAMBA_ADMIN_PASS="${ADMIN_PASS}"
samba-tool domain provision \
  --server-role=dc \
  --realm="${REALM}" \
  --domain="${NETBIOS}" \
  --dns-backend=SAMBA_INTERNAL \
  --use-rfc2307 \
  --adminpass="${SAMBA_ADMIN_PASS}"

unset SAMBA_ADMIN_PASS
ADMIN_PASS=""
ADMIN_PASS2=""

say ""
say "── Запуск службы DC ──"
if systemctl list-unit-files | grep -q '^samba-ad-dc.service'; then
  systemctl unmask samba-ad-dc 2>/dev/null || true
  systemctl enable samba-ad-dc
  systemctl restart samba-ad-dc
elif systemctl list-unit-files | grep -q '^samba.service'; then
  systemctl enable samba
  systemctl restart samba
else
  say "Не найден unit samba-ad-dc — запустите DC вручную по документации дистрибутива."
fi

say ""
say "Проверка: samba-tool domain info"
samba-tool domain info || true

say ""
say "═══════════════════════════════════════════════════════════════════"
say "  Домен: ${DOMAIN_DNS}  |  Realm: ${REALM}"
say "  Дальше:"
say "    1) Настройте DNS у клиентов на IP этого сервера или /etc/hosts."
say "    2) Установите domain-agent, python -m domain_agent setup (секрет, IP DC = этот хост)."
say "    3) В панели зарегистрируйте агент; на РС — join-workstation.sh с панели."
say "═══════════════════════════════════════════════════════════════════"
say ""
