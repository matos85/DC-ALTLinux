from datetime import timedelta
import json
import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def env(key: str, default: str | None = None) -> str | None:
    value = os.getenv(key)
    return value if value not in (None, "") else default


def env_bool(key: str, default: bool = False) -> bool:
    value = env(key)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


SECRET_KEY = env(
    "DJANGO_SECRET_KEY",
    "dev-only-change-me-domain-admin-panel-secret-key",
)
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [host.strip() for host in env("DJANGO_ALLOWED_HOSTS", "*").split(",") if host.strip()]
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in env(
        "DJANGO_CSRF_TRUSTED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000",
    ).split(",")
    if origin.strip()
]


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "accounts",
    "auditlog",
    "orchestration",
    "directory",
    "panel_downloads",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "auditlog.middleware.AuditContextMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"


if env_bool("USE_SQLITE", False):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB", "domain_admin"),
            "USER": env("POSTGRES_USER", "domain_admin"),
            "PASSWORD": env("POSTGRES_PASSWORD", "domain_admin"),
            "HOST": env("POSTGRES_HOST", "localhost"),
            "PORT": env("POSTGRES_PORT", "5432"),
        }
    }


AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


LANGUAGE_CODE = "ru-ru"
TIME_ZONE = env("TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True


STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in env(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100",
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

CELERY_BROKER_URL = env("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", False)
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

DOMAIN_AGENT_TIMEOUT = int(env("DOMAIN_AGENT_TIMEOUT", "20"))
DOMAIN_AGENT_DEFAULT_SECRET = env("DOMAIN_AGENT_DEFAULT_SECRET", "change-me-agent-secret")

# Архив агента для скачивания с панели (собирается в Docker или через build_agent_bundle).
AGENT_BUNDLE_PATH = Path(env("AGENT_BUNDLE_PATH", str(BASE_DIR / "var" / "agent_dist" / "domain-agent.tgz")))
# Секрет для GET /api/agent/bundle/?token=... (на новых машинах без JWT). По умолчанию совпадает с секретом агента.
AGENT_DOWNLOAD_TOKEN = (env("AGENT_DOWNLOAD_TOKEN") or "").strip() or (DOMAIN_AGENT_DEFAULT_SECRET or "").strip()
# Как браузеры и curl на других хостах обращаются к UI (порт Next.js), например http://192.168.1.10:3000
PANEL_PUBLIC_BASE_URL = (env("PANEL_PUBLIC_BASE_URL", "http://localhost:3000") or "").strip().rstrip("/")
# Исходники агента для локальной команды build_agent_bundle (каталог admin-panel/agent).
AGENT_SOURCE_DIR = Path(env("AGENT_SOURCE_DIR", str(BASE_DIR.parent / "agent")))

_join_bundled = BASE_DIR / "var" / "agent_scripts" / "join_workstation_domain.sh"
_join_repo = BASE_DIR.parent / "scripts" / "join_workstation_domain.sh"
AGENT_JOIN_SCRIPT_PATH = Path(
    env(
        "AGENT_JOIN_SCRIPT_PATH",
        str(_join_bundled) if _join_bundled.is_file() else str(_join_repo),
    )
)

_prov_bundled = BASE_DIR / "var" / "agent_scripts" / "provision_samba_dc.sh"
_prov_repo = BASE_DIR.parent / "scripts" / "provision_samba_dc.sh"
AGENT_PROVISION_DC_SCRIPT_PATH = Path(
    env(
        "AGENT_PROVISION_DC_SCRIPT_PATH",
        str(_prov_bundled) if _prov_bundled.is_file() else str(_prov_repo),
    )
)


def _audit_share_critical_actions() -> frozenset[str]:
    raw = env(
        "AUDIT_SHARE_CRITICAL_ACTIONS",
        "samba.share.delete,samba.acl.set,samba.share.create",
    )
    return frozenset(x.strip() for x in (raw or "").split(",") if x.strip())


AUDIT_SHARE_CRITICAL_ACTIONS = _audit_share_critical_actions()
AUDIT_SHARE_LOG_READS = env_bool("AUDIT_SHARE_LOG_READS", True)


def _audit_agent_share_log_paths() -> list[str]:
    raw = env("AUDIT_AGENT_SHARE_LOG_PATHS", "")
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return [str(p) for p in data]
        except json.JSONDecodeError:
            pass
    return [
        "/var/log/samba/log.smbd",
        "/var/log/samba/log.rpcd_classic",
        "/var/log/samba/log.rpcd_fsrv",
    ]


AUDIT_AGENT_SHARE_LOG_PATHS = _audit_agent_share_log_paths()
AUDIT_AGENT_SHARE_LOG_MAX_LINES = int(env("AUDIT_AGENT_SHARE_LOG_MAX_LINES", "400"))
AUDIT_AGENT_SHARE_LOG_PREVIEW_LINES = int(env("AUDIT_AGENT_SHARE_LOG_PREVIEW_LINES", "40"))
