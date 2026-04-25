from __future__ import annotations

import os

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse, HttpResponseForbidden
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsOperator


def _forbidden_download_token(request) -> HttpResponse | None:
    token = (request.GET.get("token") or "").strip()
    expected = (getattr(settings, "AGENT_DOWNLOAD_TOKEN", None) or "").strip()
    if not expected:
        return HttpResponseForbidden(
            "Скачивание отключено: задайте AGENT_DOWNLOAD_TOKEN на сервере панели.",
            content_type="text/plain; charset=utf-8",
        )
    if token != expected:
        return HttpResponseForbidden("Неверный или отсутствующий token.", content_type="text/plain; charset=utf-8")
    return None


class AgentBundleDownloadView(APIView):
    """Скачивание архива агента по секрету (для curl с новой машины без входа в панель)."""

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        denied = _forbidden_download_token(request)
        if denied:
            return denied

        path = getattr(settings, "AGENT_BUNDLE_PATH", None)
        if not path or not os.path.isfile(path):
            raise Http404("Архив агента не собран. Пересоберите образ backend или выполните: python manage.py build_agent_bundle")

        return FileResponse(
            open(path, "rb"),
            content_type="application/gzip",
            as_attachment=True,
            filename="domain-agent.tgz",
        )


class JoinWorkstationScriptDownloadView(APIView):
    """Скачивание интерактивного скрипта ввода рабочей станции в домен (тот же token, что и у архива агента)."""

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        denied = _forbidden_download_token(request)
        if denied:
            return denied

        path = getattr(settings, "AGENT_JOIN_SCRIPT_PATH", None)
        if not path or not os.path.isfile(path):
            raise Http404(
                "Скрипт не найден. В образе backend должен быть /app/var/agent_scripts/join_workstation_domain.sh "
                "или задайте AGENT_JOIN_SCRIPT_PATH."
            )

        return FileResponse(
            open(path, "rb"),
            content_type="text/x-shellscript; charset=utf-8",
            as_attachment=True,
            filename="join-workstation.sh",
        )


class ProvisionDcScriptDownloadView(APIView):
    """Скачивание скрипта первичного развёртывания Samba AD DC (тот же token)."""

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        denied = _forbidden_download_token(request)
        if denied:
            return denied

        path = getattr(settings, "AGENT_PROVISION_DC_SCRIPT_PATH", None)
        if not path or not os.path.isfile(path):
            raise Http404(
                "Скрипт не найден. Пересоберите backend или задайте AGENT_PROVISION_DC_SCRIPT_PATH."
            )

        return FileResponse(
            open(path, "rb"),
            content_type="text/x-shellscript; charset=utf-8",
            as_attachment=True,
            filename="provision-dc.sh",
        )


class AgentInstallInfoView(APIView):
    """Подсказки: URL скачивания и команды (операторы панели: superadmin, domain_admin, helpdesk)."""

    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request):
        base = getattr(settings, "PANEL_PUBLIC_BASE_URL", "") or "http://localhost:3000"
        base = str(base).strip().rstrip("/")
        token = getattr(settings, "AGENT_DOWNLOAD_TOKEN", "") or ""
        download_path = "/api/backend/agent/bundle/"
        join_path = "/api/backend/agent/join-workstation.sh/"
        provision_path = "/api/backend/agent/provision-dc.sh/"
        query = f"?token={token}" if token else ""
        bundle_url = f"{base}{download_path}{query}"
        join_script_url = f"{base}{join_path}{query}"
        provision_dc_script_url = f"{base}{provision_path}{query}"

        curl = (
            f"curl -fsSL '{bundle_url}' -o domain-agent.tgz && "
            f"tar xzf domain-agent.tgz && sudo ./install.sh"
        )
        curl_join_workstation = (
            f"curl -fsSL '{join_script_url}' -o join-workstation.sh && "
            f"chmod +x join-workstation.sh && ./join-workstation.sh"
        )
        curl_provision_dc = (
            f"curl -fsSL '{provision_dc_script_url}' -o provision-dc.sh && "
            f"chmod +x provision-dc.sh && sudo ./provision-dc.sh"
        )

        return Response(
            {
                "public_base_url": base,
                "bundle_url": bundle_url,
                "join_workstation_script_url": join_script_url,
                "provision_dc_script_url": provision_dc_script_url,
                "curl_download_and_install": curl,
                "curl_join_workstation": curl_join_workstation,
                "curl_provision_dc": curl_provision_dc,
                "token_configured": bool(token),
                "steps": [
                    "Сеть: панель, DC и РС должны видеть друг друга по IP (не используйте один и тот же NAT 10.0.2.15 на двух ВМ — Host-only / Internal + разные адреса).",
                    "На будущем DC (сервер ALT): скачайте и выполните скрипт развёртывания домена (curl_provision_dc) от root.",
                    "На хосте панели: PANEL_PUBLIC_BASE_URL = URL, с которого ВМ открывают эти скрипты (http://IP_ХОСТА_С_DOCKER:3000).",
                    "На DC после домена: установите агент (архив + install.sh + python -m domain_agent setup), в панели «Серверы» добавьте http://IP_DC:8090 и shared_secret.",
                    "На рабочей станции: curl_join_workstation — ввод в домен (не от root).",
                ],
            }
        )
