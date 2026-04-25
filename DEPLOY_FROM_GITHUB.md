# Развёртывание проекта после `git clone`

Эта инструкция позволяет любому разработчику поднять проект локально через Docker Desktop.

## 1) Предварительные требования

- Установлен `Git`
- Установлен `Docker Desktop` (режим Linux containers)
- Открыты порты `3000`, `8000`, `8090`, `5432`, `6379`

Проверка:

```bash
git --version
docker --version
docker compose version
```

## 2) Клонирование репозитория

```bash
git clone https://github.com/matos85/DC-ALTLinux.git
cd DC-ALTLinux/admin-panel
```

## 3) Переменные окружения (рекомендуется)

В проекте есть пример:

```bash
cp .env.example .env
```

Для первого запуска можно оставить значения по умолчанию, но обязательно смените секреты/пароли перед реальным использованием:

- `DJANGO_SECRET_KEY`
- `PANEL_BOOTSTRAP_PASSWORD`
- `DOMAIN_AGENT_DEFAULT_SECRET`
- `AGENT_SHARED_SECRET`

## 4) Запуск инфраструктуры (frontend + backend + db + worker + agent)

```bash
cd infra
docker compose up -d --build
```

## 5) Проверка, что всё запущено

```bash
docker compose ps
```

Ожидаемые сервисы:

- `frontend` -> `http://localhost:3000`
- `backend` -> `http://localhost:8000`
- `agent` -> `http://localhost:8090`
- `postgres`, `redis`, `worker` -> в статусе `Up`

## 6) Первый вход

По умолчанию backend создаёт bootstrap-админа (смотрите переменные в `infra/docker-compose.yml`):

- логин: `admin`
- пароль: значение `PANEL_BOOTSTRAP_PASSWORD`

После входа сразу смените пароль администратора.

## 7) Полезные команды эксплуатации

Пересобрать только frontend:

```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

Просмотр логов:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f worker
```

Остановить проект:

```bash
docker compose down
```

Полный сброс с удалением БД-тома:

```bash
docker compose down -v
```

## 8) Важное ограничение для доменных операций

Для реального управления `Samba AD` агент должен быть доступен до доменного контроллера.
Проверьте сетевые параметры в `infra/docker-compose.yml`:

- `AGENT_PRIMARY_DC_IP`
- `AGENT_SMB_HOST`
- секреты backend/agent должны совпадать

Иначе интерфейс поднимется, но часть доменных операций будет недоступна.
