from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

from django.conf import settings

from .models import ManagedServer


class AgentRequestError(Exception):
    pass


@dataclass
class AgentResponse:
    status_code: int
    payload: dict


class DomainAgentClient:
    def __init__(self, server: ManagedServer):
        self.server = server
        self.secret = server.shared_secret or settings.DOMAIN_AGENT_DEFAULT_SECRET

    def _headers(self, body: bytes) -> dict[str, str]:
        timestamp = str(int(time.time()))
        signature_payload = timestamp.encode("utf-8") + b"." + body
        signature = hmac.new(
            self.secret.encode("utf-8"),
            signature_payload,
            hashlib.sha256,
        ).hexdigest()
        return {
            "Content-Type": "application/json",
            "X-Agent-Timestamp": timestamp,
            "X-Agent-Signature": signature,
        }

    def request(self, path: str, payload: dict | None = None, method: str = "POST") -> AgentResponse:
        body = json.dumps(payload or {}).encode("utf-8")
        request = urllib.request.Request(
            url=f"{self.server.base_url.rstrip('/')}{path}",
            data=body,
            headers=self._headers(body),
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=settings.DOMAIN_AGENT_TIMEOUT) as response:
                return AgentResponse(
                    status_code=response.status,
                    payload=json.loads(response.read().decode("utf-8") or "{}"),
                )
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="ignore")
            raise AgentRequestError(details or str(exc)) from exc
        except urllib.error.URLError as exc:
            raise AgentRequestError(str(exc)) from exc

    def health(self) -> AgentResponse:
        request = urllib.request.Request(
            url=f"{self.server.base_url.rstrip('/')}/health",
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=settings.DOMAIN_AGENT_TIMEOUT) as response:
                return AgentResponse(
                    status_code=response.status,
                    payload=json.loads(response.read().decode("utf-8") or "{}"),
                )
        except urllib.error.URLError as exc:
            raise AgentRequestError(str(exc)) from exc

    def execute(self, operation: str, payload: dict | None = None, dry_run: bool = False) -> AgentResponse:
        return self.request(
            "/execute",
            {
                "operation": operation,
                "payload": payload or {},
                "dry_run": dry_run,
            },
        )
