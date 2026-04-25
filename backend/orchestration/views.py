from django.db.models import Count
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAuditorOrHigher, IsDomainAdmin
from auditlog.models import AuditEvent, AuditSource
from auditlog.service import write_audit_event
from auditlog.share_policy import audit_category_for_operation, severity_for_queued

from .client import AgentRequestError, DomainAgentClient
from .models import ExecutionJob, JobStatus, ManagedServer
from .serializers import ExecutionJobSerializer, ManagedServerSerializer, ManagedServerWriteSerializer
from .tasks import execute_job


class ManagedServerViewSet(viewsets.ModelViewSet):
    queryset = ManagedServer.objects.all().order_by("name")
    permission_classes = [IsAuthenticated, IsDomainAdmin]

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return ManagedServerWriteSerializer
        return ManagedServerSerializer

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAuditorOrHigher])
    def health(self, request, pk=None):
        server = self.get_object()
        try:
            response = DomainAgentClient(server).health()
        except AgentRequestError as exc:
            return Response({"status": "error", "detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        server.last_seen_at = timezone.now()
        server.save(update_fields=["last_seen_at"])
        return Response(response.payload)


class ExecutionJobViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ExecutionJob.objects.select_related("server", "requested_by").all()
    serializer_class = ExecutionJobSerializer
    permission_classes = [IsAuthenticated, IsAuditorOrHigher]

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsDomainAdmin])
    def retry(self, request, pk=None):
        job = self.get_object()
        new_job = ExecutionJob.objects.create(
            server=job.server,
            requested_by=request.user,
            operation=job.operation,
            target_type=job.target_type,
            target_name=job.target_name,
            payload=job.payload,
            dry_run=job.dry_run,
        )
        execute_job.delay(new_job.id)
        write_audit_event(
            actor=request.user,
            action=f"{job.operation}.retry",
            target_type=job.target_type,
            target_id=job.target_name,
            metadata={"source_job_id": job.id, "new_job_id": new_job.id, "phase": "retry"},
            category=audit_category_for_operation(job.operation, job.target_type),
            severity=severity_for_queued(job.operation, job.target_type),
            source=AuditSource.PANEL,
        )
        return Response(ExecutionJobSerializer(new_job).data, status=status.HTTP_202_ACCEPTED)


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAuditorOrHigher]

    def get(self, request):
        summary = {
            "servers": ManagedServer.objects.count(),
            "jobs_total": ExecutionJob.objects.count(),
            "jobs_running": ExecutionJob.objects.filter(status=JobStatus.RUNNING).count(),
            "jobs_failed": ExecutionJob.objects.filter(status=JobStatus.FAILED).count(),
            "audit_events": AuditEvent.objects.count(),
            "jobs_by_status": list(
                ExecutionJob.objects.values("status").annotate(count=Count("id")).order_by("status")
            ),
        }
        return Response(summary)
