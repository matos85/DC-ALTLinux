#!/usr/bin/env bash
#
# Интерактивный ввод рабочей станции Linux (ALT / RHEL-подобные / Debian-подобные)
# в домен Samba AD / Active Directory.
#
# Скачивание с панели (подставьте URL и токен):
#   curl -fsSL 'http://ПАНЕЛЬ:3000/api/backend/agent/join-workstation.sh/?token=СЕКРЕТ' -o join-workstation.sh
#   chmod +x join-workstation.sh
#   ./join-workstation.sh
#
set -euo pipefail

say() { printf '%s\n' "$*"; }
err() { printf '%s\n' "$*" >&2; }

if [[ "$(id -u)" -eq 0 ]]; then
  err "Запускайте скрипт обычным пользователем; команды с правами root выполнятся через sudo."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  err "Нужен sudo."
  exit 1
fi

say ""
say "═══════════════════════════════════════════════════════════════════"
say "  Ввод рабочей станции в домен (Samba AD / AD)"
say "═══════════════════════════════════════════════════════════════════"
say ""
say "Нужны: сеть до контроллера домена, учётная запись с правом вводить машины в домен."
say ""

read -r -p "DNS-имя домена (например corp.example.com): " DOMAIN_DNS
DOMAIN_DNS="${DOMAIN_DNS//[[:space:]]/}"
if [[ -z "${DOMAIN_DNS}" ]]; then
  err "Домен не может быть пустым."
  exit 1
fi

read -r -p "IP основного контроллера домена (для /etc/hosts, если DNS ещё не настроен): " PRIMARY_DC_IP
PRIMARY_DC_IP="${PRIMARY_DC_IP//[[:space:]]/}"
if [[ -z "${PRIMARY_DC_IP}" ]]; then
  err "IP контроллера не может быть пустым."
  exit 1
fi

DEFAULT_USER="Administrator"
read -r -p "Учётная запись администратора домена [${DEFAULT_USER}]: " ADMIN_USER
ADMIN_USER="${ADMIN_USER:-$DEFAULT_USER}"

CUR_SHORT="$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo workstation)"
read -r -p "Краткое имя компьютера в домене [${CUR_SHORT}]: " HOST_INPUT
HOST_SHORT="${HOST_INPUT:-$CUR_SHORT}"
HOST_SHORT="${HOST_SHORT//[[:space:]]/}"

read -r -p "Установить имя хоста в «${HOST_SHORT}» через hostnamectl? [Y/n]: " SET_HOST
if [[ -z "${SET_HOST}" || "${SET_HOST}" =~ ^[YyДд] ]]; then
  sudo hostnamectl set-hostname "${HOST_SHORT}"
  say "Имя хоста: ${HOST_SHORT}"
fi

read -r -p "Добавить в /etc/hosts строку «${PRIMARY_DC_IP} ${DOMAIN_DNS}» (если домен ещё не резолвится)? [Y/n]: " ADD_HOSTS
if [[ -z "${ADD_HOSTS}" || "${ADD_HOSTS}" =~ ^[YyДд] ]]; then
  LINE="${PRIMARY_DC_IP}	${DOMAIN_DNS}"
  if grep -qF "${DOMAIN_DNS}" /etc/hosts 2>/dev/null; then
    say "(Уже есть запись с ${DOMAIN_DNS} в /etc/hosts — пропуск.)"
  else
    echo "${LINE}" | sudo tee -a /etc/hosts >/dev/null
    say "Запись добавлена в /etc/hosts."
  fi
fi

say ""
say "── Пакеты ──"
if command -v apt-get >/dev/null 2>&1; then
  say "Обнаружен apt. Для realm/sssd обычно нужны пакеты:"
  say "  sudo apt-get update"
  say "  sudo apt-get install -y realmd sssd sssd-ad adcli samba-common-bin libnss-sss libpam-sss krb5-user oddjob oddjob-mkhomedir packagekit"
  read -r -p "Установить их сейчас? [Y/n]: " DO_APT
  if [[ -z "${DO_APT}" || "${DO_APT}" =~ ^[YyДд] ]]; then
    sudo apt-get update
    if apt-cache show task-samba-client >/dev/null 2>&1; then
      sudo apt-get install -y task-samba-client krb5-user winbind libnss-winbind libpam-winbind || true
    elif apt-cache show samba-client >/dev/null 2>&1; then
      sudo apt-get install -y samba-client samba-winbind krb5-user libnss-winbind libpam-winbind || true
    else
      sudo apt-get install -y realmd sssd sssd-ad adcli samba-common-bin libnss-sss libpam-sss krb5-user oddjob oddjob-mkhomedir packagekit || true
    fi
  fi
elif command -v dnf >/dev/null 2>&1; then
  say "Обнаружен dnf. Пример:"
  say "  sudo dnf install -y realmd sssd sssd-ad adcli samba-common-tools krb5-workstation oddjob oddjob-mkhomedir"
  read -r -p "Установить их сейчас? [Y/n]: " DO_DNF
  if [[ -z "${DO_DNF}" || "${DO_DNF}" =~ ^[YyДд] ]]; then
    sudo dnf install -y realmd sssd sssd-ad adcli samba-common-tools krb5-workstation oddjob oddjob-mkhomedir || true
  fi
else
  say "Не найден apt/dnf — установите realmd, sssd, adcli вручную для вашего дистрибутива."
fi

say ""
say "── Способ ввода в домен ──"
say "1) realm join (рекомендуется для рабочей станции с SSSD)"
say "2) net ads join (Samba winbind; если realm недоступен)"
read -r -p "Выберите [1/2] (по умолчанию 1): " MODE
MODE="${MODE:-1}"

join_realm() {
  if ! command -v realm >/dev/null 2>&1; then
    err "Команда realm не найдена. Установите пакет realmd."
    return 1
  fi
  say ""
  say "Запуск: sudo realm join -U ${ADMIN_USER} ${DOMAIN_DNS}"
  say "Введите пароль администратора домена, когда sudo попросит пароль пользователя, затем — пароль домена."
  say ""
  sudo realm join --verbose -U "${ADMIN_USER}" "${DOMAIN_DNS}"
}

join_net_ads() {
  if ! command -v net >/dev/null 2>&1; then
    err "Команда net не найдена. Установите samba-common-bin / samba-client."
    return 1
  fi
  say ""
  say "Запуск: sudo net ads join -U ${ADMIN_USER} -S ${PRIMARY_DC_IP}"
  say "Введите пароль учётной записи домена по запросу."
  say ""
  sudo net ads join -U "${ADMIN_USER}" -S "${PRIMARY_DC_IP}"
}

case "${MODE}" in
  2)
    join_net_ads
    say ""
    say "После net ads join обычно нужны winbind и nsswitch — см. документацию Samba для вашей ОС."
    ;;
  *)
    if join_realm; then
      say ""
      say "Проверка: realm list"
      realm list 2>/dev/null || true
      say ""
      say "Включите и запустите sssd (если ещё не запущен):"
      say "  sudo systemctl enable --now sssd"
      say "  sudo systemctl restart sssd"
    else
      err "realm join не удался. Попробуйте вариант 2 (net ads) или проверьте DNS, время (NTP) и firewall."
      exit 1
    fi
    ;;
esac

say ""
say "═══════════════════════════════════════════════════════════════════"
say "  Готово. Перезайдите в сеанс или перезагрузите ПК, чтобы применились NSS/PAM."
say "═══════════════════════════════════════════════════════════════════"
say ""
