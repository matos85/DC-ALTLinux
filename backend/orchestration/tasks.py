from celery import shared_task
from django.utils import timezone

from auditlog.models import AuditSource, AuditStatus
from auditlog.service import write_audit_event
from auditlog.share_policy import audit_category_for_operation, severity_for_job_completion

from .client import AgentRequestError, DomainAgentClient
from .models import ExecutionJob, JobStatus


@shared_task
def execute_job(job_id: int):
    job = ExecutionJob.objects.select_related("server", "requested_by").get(pk=job_id)
    job.status = JobStatus.RUNNING
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at"])

    client = DomainAgentClient(job.server)
    try:
        response = client.execute(job.operation, payload=job.payload, dry_run=job.dry_run)
        job.status = JobStatus.SUCCEEDED
        job.result = response.payload
        job.stdout = response.payload.get("stdout", "")
        job.stderr = response.payload.get("stderr", "")
        job.agent_request_id = response.payload.get("request_id", "")
        out = response.payload.get("stdout") or ""
        meta = {
            "job_id": job.id,
            "server": job.server.slug,
            "phase": "completed",
            "agent_request_id": response.payload.get("request_id", ""),
        }
        if out:
            meta["stdout_preview"] = out[:8000]
        write_audit_event(
            actor=job.requested_by,
            action=job.operation,
            status=AuditStatus.SUCCESS,
            target_type=job.target_type,
            target_id=job.target_name,
            metadata=meta,
            category=audit_category_for_operation(job.operation, job.target_type),
            severity=severity_for_job_completion(job.operation, job.target_type, True),
            source=AuditSource.PANEL,
        )
    except AgentRequestError as exc:
        job.status = JobStatus.FAILED
        job.stderr = str(exc)
        write_audit_event(
            actor=job.requested_by,
            action=job.operation,
            status=AuditStatus.FAILURE,
            target_type=job.target_type,
            target_id=job.target_name,
            metadata={
                "job_id": job.id,
                "server": job.server.slug,
                "phase": "completed",
                "error": str(exc),
            },
            category=audit_category_for_operation(job.operation, job.target_type),
            severity=severity_for_job_completion(job.operation, job.target_type, False),
            source=AuditSource.PANEL,
        )

    job.finished_at = timezone.now()
    job.save(
        update_fields=[
            "status",
            "result",
            "stdout",
            "stderr",
            "agent_request_id",
            "finished_at",
        ]
    )
    return job.status
