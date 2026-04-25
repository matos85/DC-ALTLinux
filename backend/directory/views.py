from __future__ import annotations

from django.conf import settings as django_settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAuditorOrHigher, IsDomainAdmin, IsOperator
from auditlog.models import AuditSeverity, AuditSource, AuditStatus
from auditlog.service import write_audit_event
from auditlog.share_policy import audit_category_for_operation, severity_for_queued
from orchestration.client import AgentRequestError, DomainAgentClient
from orchestration.models import ExecutionJob, ManagedServer
from orchestration.serializers import ExecutionJobSerializer
from orchestration.tasks import execute_job

from .models import ShareTemplate
from .serializers import (
    ComputerDeleteSerializer,
    DnsRecordSerializer,
    GroupMemberSerializer,
    JoinCommandSerializer,
    OrganizationalUnitSerializer,
    SambaGroupCreateSerializer,
    SambaUserCreateSerializer,
    SambaUserPasswordSerializer,
    ShareAclSerializer,
    ShareTemplateSerializer,
)


def resolve_default_server(serializer_or_request=None) -> ManagedServer | None:
    server = None
    if serializer_or_request is not None and hasattr(serializer_or_request, "validated_data"):
        server = serializer_or_request.validated_data.get("server")
    if server is None:
        server = ManagedServer.objects.filter(is_default=True, is_active=True).first()
    if server is None:
        server = ManagedServer.objects.filter(is_active=True).first()
    return server


def get_target_server(serializer_or_request) -> ManagedServer:
    server = resolve_default_server(serializer_or_request)
    if server is None:
        raise ValidationError(
            {
                "detail": "Нет активного доменного сервера. Добавьте сервер в разделе «Серверы» и при необходимости отметьте его сервером по умолчанию."
            }
        )
    return server


def run_sync(server: ManagedServer, operation: str, payload: dict | None = None, dry_run: bool = False):
    client = DomainAgentClient(server)
    return client.execute(operation, payload=payload or {}, dry_run=dry_run).payload


def enqueue_job(*, request, server: ManagedServer, operation: str, target_type: str, target_name: str, payload: dict, dry_run: bool):
    job = ExecutionJob.objects.create(
        server=server,
        requested_by=request.user,
        operation=operation,
        target_type=target_type,
        target_name=target_name,
        payload=payload,
        dry_run=dry_run,
    )
    execute_job.delay(job.id)
    category = audit_category_for_operation(operation, target_type)
    meta: dict = {"job_id": job.id, "server": server.slug, "queued": True, "phase": "requested"}
    if category == "share":
        keys = (
            "name",
            "path",
            "description",
            "read_groups",
            "change_groups",
            "full_groups",
            "principal",
            "access",
            "share_name",
            "share_path",
        )
        meta["share_detail"] = {k: payload[k] for k in keys if k in payload}
    write_audit_event(
        actor=request.user,
        action=operation,
        target_type=target_type,
        target_id=target_name,
        status=AuditStatus.INFO,
        metadata=meta,
        category=category,
        severity=severity_for_queued(operation, target_type),
        source=AuditSource.PANEL,
    )
    return job


class DirectorySummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAuditorOrHigher]

    def get(self, request):
        server = resolve_default_server(request)
        if server is None:
            return Response(
                {
                    "server": {"id": None, "name": "Не настроено", "slug": "-", "role": "-"},
                    "share_templates": 0,
                    "available_modules": [],
                }
            )
        summary = {
            "server": {"id": server.id, "name": server.name, "slug": server.slug, "role": server.role},
            "share_templates": ShareTemplate.objects.filter(server=server).count(),
            "available_modules": [
                "users",
                "groups",
                "shares",
                "acl",
                "computers",
                "ou",
                "dns",
                "jobs",
            ],
        }
        return Response(summary)


class SambaUsersView(APIView):
    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request):
        server = resolve_default_server(request)
        if server is None:
            return Response({"data": {"items": []}})
        try:
            result = run_sync(server, "samba.user.list")
        except AgentRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(result)

    def post(self, request):
        serializer = SambaUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        server = get_target_server(serializer)
        payload = dict(serializer.validated_data)
        payload.pop("server", None)
        dry_run = payload.pop("dry_run", False)
        job = enqueue_job(
            request=request,
            server=server,
            operation="samba.user.create",
            target_type="user",
            target_name=payload["username"],
            payload=payload,
            dry_run=dry_run,
        )
        return Response(ExecutionJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class SambaUserActionView(APIView):
    permission_classes = [IsAuthenticated, IsDomainAdmin]

    def post(self, request, username: str, action_name: str):
        payload = {"username": username}
        dry_run = bool(request.data.get("dry_run", False))
        if action_name == "reset-password":
            serializer = SambaUserPasswordSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            server = get_target_server(serializer)
            payload["password"] = serializer.validated_data["password"]
        else:
            server = get_target_server(request)

        mapping = {
            "enable": "samba.user.enable",
            "disable": "samba.user.disable",
            "delete": "samba.user.delete",
            "reset-password": "samba.user.reset_password",
        }
        operation = mapping.get(action_name)
        if operation is None:
            return Response({"detail": "Unsupported action."}, status=status.HTTP_400_BAD_REQUEST)

        job = enqueue_job(
            request=request,
            server=server,
            operation=operation,
            target_type="user",
            target_name=username,
            payload=payload,
            dry_run=dry_run,
        )
        return Response(ExecutionJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class SambaGroupsView(APIView):
    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request):
        server = resolve_default_server(request)
        if server is None:
            return Response({"data": {"items": []}})
        try:
            result = run_sync(server, "samba.group.list")
        except AgentRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(result)

    def post(self, request):
        serializer = SambaGroupCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        server = get_target_server(serializer)
        payload = dict(serializer.validated_data)
        payload.pop("server", None)
        dry_run = payload.pop("dry_run", False)
        job = enqueue_job(
            request=request,
            server=server,
            operation="samba.group.create",
            target_type="group",
            target_name=payload["name"],
            payload=payload,
            dry_run=dry_run,
        )
        return Response(ExecutionJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class SambaGroupMembersView(APIView):
    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request, name: str):
        server = resolve_default_server(request)
        if server is None:
            return Response({"group": name, "members": []})
        try:
            result = run_sync(server, "samba.group.list_members", {"name": name})
        except AgentRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        members = result.get("data", {}).get("members", [])
        return Response({"group": name, "members": members})


class SambaGroupActionView(APIView):
    permission_classes = [IsAuthenticated, IsDomainAdmin]

    def post(self, request, name: str, action_name: str):
        if action_name == "delete":
            server = get_target_server(request)
            payload = {"name": name}
        elif action_name in {"add-member", "remove-member"}:
            serializer = GroupMemberSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            server = get_target_server(serializer)
            payload = {
                "name": name,
                "username": serializer.validated_data["username"],
            }
        else:
            return Response({"detail": "Unsupported action."}, status=status.HTTP_400_BAD_REQUEST)

        mapping = {
            "delete": "samba.group.delete",
            "add-member": "samba.group.add_member",
            "remove-member": "samba.group.remove_member",
        }
        job = enqueue_job(
            request=request,
            server=server,
            operation=mapping[action_name],
            target_type="group",
            target_name=name,
            payload=payload,
            dry_run=bool(request.data.get("dry_run", False)),
        )
        return Response(ExecutionJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class ComputersView(APIView):
    permission_classes = [IsAuthenticated, IsAuditorOrHigher]

    def get(self, request):
        server = resolve_default_server(request)
        if server is None:
            return Response({"data": {"items": []}})
        try:
            result = run_sync(server, "samba.computer.list")
        except AgentRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(result)

    def post(self, request):
        serializer = ComputerDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        server = get_target_server(serializer)
        payload = {
            "hostname": serializer.validated_data["hostname"],
        }
        job = enqueue_job(
            request=request,
            server=server,
            operation="samba.computer.delete",
            target_type="computer",
            target_name=payload["hostname"],
            payload=payload,
            dry_run=serializer.validated_data.get("dry_run", False),
        )
        return Response(ExecutionJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class OrganizationalUnitsView(APIView):
    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request):
        server = resolve_default_server(request)
        if server is None:
            return Response({"data": {"items": []}})
        try:
            result = run_sync(server, "samba.ou.list")
        except AgentRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(result)

    def post(self, request):
        serializer = OrganizationalUnitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        server = get_target_server(serializer)
        payload = dict(serializer.validated_data)
        payload.pop("server", None)
        dry_run = payload.pop("dry_run", False)
        operation = "samba.ou.delete" if request.query_params.get("action") == "delete" else "samba.ou.create"
        target_name = payload.get("distinguished_name") or payload.get("name")
        job = enqueue_job(
            request=request,
            server=server,
            operation=operation,
            target_type="ou",
            target_name=target_name,
            payload=payload,
            dry_run=dry_run,
        )
        return Response(ExecutionJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class DnsRecordsView(APIView):
    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request):
        server = resolve_default_server(request)
        zone = request.query_params.get("zone", "")
        if server is None:
            return Response({"data": {"zone": zone, "records": []}})
        try:
            result = run_sync(server, "samba.dns.list", payload={"zone": zone})
        except AgentRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(result)

    def post(self, request):
        serializer = DnsRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        server = get_target_server(serializer)
        payload = dict(serializer.validated_data)
        payload.pop("server", None)
        dry_run = payload.pop("dry_run", False)
        operation = request.query_params.get("action", "create")
        operation_name = "samba.dns.create" if operation != "delete" else "samba.dns.delete"
        job = enqueue_job(
            request=request,
            server=server,
            operation=operation_name,
            target_type="dns",
            target_name=f"{payload['name']}.{payload['zone']}",
            payload=payload,
            dry_run=dry_run,
        )
        return Response(ExecutionJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class SharesView(APIView):
    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request):
        server = resolve_default_server(request)
        if server is None:
            return Response(
                {
                    "server": "-",
                    "templates": [],
                    "live": {"items": []},
                }
            )
        db_items = ShareTemplate.objects.filter(server=server)
        try:
            live = run_sync(server, "samba.share.list")
        except AgentRequestError:
            live = {"items": []}
        if django_settings.AUDIT_SHARE_LOG_READS:
            write_audit_event(
                actor=request.user,
                action="samba.share.list",
                target_type="share",
                target_id=server.slug,
                status=AuditStatus.INFO,
                metadata={"server": server.slug, "phase": "read", "template_count": db_items.count()},
                category="share",
                severity=AuditSeverity.NORMAL,
                source=AuditSource.PANEL,
            )
        payload = {
            "server": server.slug,
            "templates": ShareTemplateSerializer(db_items, many=True).data,
            "live": live,
        }
        return Response(payload)

    def post(self, request):
        serializer = ShareTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        server = serializer.validated_data.get("server") or get_target_server(serializer)
        share = serializer.save(server=server)
        payload = {
            "name": share.name,
            "path": share.path,
            "description": share.description,
            "read_groups": share.read_groups,
            "change_groups": share.change_groups,
            "full_groups": share.full_groups,
        }
        job = enqueue_job(
            request=request,
            server=share.server,
            operation="samba.share.create",
            target_type="share",
            target_name=share.name,
            payload=payload,
            dry_run=bool(request.data.get("dry_run", False)),
        )
        return Response(ExecutionJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class ShareDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOperator]

    def delete(self, request, name: str):
        server = get_target_server(request)
        share = get_object_or_404(ShareTemplate, server=server, name=name)
        payload = {"name": share.name, "path": share.path}
        dry_run = bool(request.data.get("dry_run", False))
        job = enqueue_job(
            request=request,
            server=server,
            operation="samba.share.delete",
            target_type="share",
            target_name=share.name,
            payload=payload,
            dry_run=dry_run,
        )
        if not dry_run:
            share.delete()
        return Response(ExecutionJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class ShareAclView(APIView):
    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request, name: str):
        server = resolve_default_server(request)
        if server is None:
            return Response(
                {"detail": "Сначала добавьте доменный сервер в разделе «Серверы»."},
                status=status.HTTP_404_NOT_FOUND,
            )
        share = get_object_or_404(ShareTemplate, server=server, name=name)
        try:
            payload = run_sync(
                server,
                "samba.acl.get",
                payload={"share_name": share.name, "share_path": "/"},
            )
        except AgentRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        if django_settings.AUDIT_SHARE_LOG_READS:
            write_audit_event(
                actor=request.user,
                action="samba.acl.get",
                target_type="share",
                target_id=share.name,
                status=AuditStatus.INFO,
                metadata={"server": server.slug, "share_name": share.name, "phase": "read"},
                category="share",
                severity=AuditSeverity.NORMAL,
                source=AuditSource.PANEL,
            )
        return Response(payload)

    def post(self, request, name: str):
        serializer = ShareAclSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        server = get_target_server(serializer)
        share = get_object_or_404(ShareTemplate, server=server, name=name)
        payload = dict(serializer.validated_data)
        payload.pop("server", None)
        payload["share_name"] = share.name
        payload["share_path"] = "/"
        dry_run = payload.pop("dry_run", False)
        job = enqueue_job(
            request=request,
            server=server,
            operation="samba.acl.set",
            target_type="acl",
            target_name=f"{name}:{payload['principal']}",
            payload=payload,
            dry_run=dry_run,
        )
        return Response(ExecutionJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class ShareAuditConfigView(APIView):
    """Текущие настройки аудита шар (из env / settings) — для гибкой настройки."""

    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request):
        return Response(
            {
                "critical_actions": sorted(django_settings.AUDIT_SHARE_CRITICAL_ACTIONS),
                "log_reads_enabled": django_settings.AUDIT_SHARE_LOG_READS,
                "agent_log_paths": django_settings.AUDIT_AGENT_SHARE_LOG_PATHS,
                "max_lines_default": django_settings.AUDIT_AGENT_SHARE_LOG_MAX_LINES,
                "preview_lines_stored": django_settings.AUDIT_AGENT_SHARE_LOG_PREVIEW_LINES,
            }
        )


class ShareAuditAgentPullView(APIView):
    """По запросу: забрать хвосты логов Samba с агента и записать снимок в журнал аудита."""

    permission_classes = [IsAuthenticated, IsOperator]

    def post(self, request):
        server = resolve_default_server(request)
        if server is None:
            raise ValidationError({"detail": "Нет сервера по умолчанию."})
        body = request.data if isinstance(request.data, dict) else {}
        pl: dict = {
            "max_lines": body.get("max_lines") or django_settings.AUDIT_AGENT_SHARE_LOG_MAX_LINES,
            "paths": body.get("paths"),
        }
        pl = {k: v for k, v in pl.items() if v is not None}
        try:
            result = run_sync(server, "samba.share.audit_collect", payload=pl)
        except AgentRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        files = (result.get("data") or {}).get("files") or {}
        preview_n = django_settings.AUDIT_AGENT_SHARE_LOG_PREVIEW_LINES
        truncated: dict[str, list[str]] = {}
        line_counts: dict[str, int] = {}
        for path, lines in files.items():
            if not isinstance(lines, list):
                continue
            line_counts[path] = len(lines)
            truncated[path] = lines[-preview_n:] if len(lines) > preview_n else list(lines)
        write_audit_event(
            actor=request.user,
            action="samba.share.audit_collect",
            target_type="share_audit",
            target_id=server.slug,
            status=AuditStatus.SUCCESS,
            metadata={
                "phase": "agent_pull",
                "server": server.slug,
                "line_counts": line_counts,
                "files_preview": truncated,
            },
            category="share",
            severity=AuditSeverity.NORMAL,
            source=AuditSource.AGENT,
        )
        return Response(
            {
                "ingested": True,
                "line_counts": line_counts,
                "files": files,
                "message": "Полный текст логов в ответе; в БД сохранён усечённый preview (см. событие аудита).",
            }
        )


class JoinCommandView(APIView):
    permission_classes = [IsAuthenticated, IsOperator]

    def post(self, request):
        serializer = JoinCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        server = get_target_server(serializer)
        payload = dict(serializer.validated_data)
        payload.pop("server", None)
        try:
            result = run_sync(server, "samba.join.render", payload=payload, dry_run=serializer.validated_data.get("dry_run", False))
        except AgentRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(result)
