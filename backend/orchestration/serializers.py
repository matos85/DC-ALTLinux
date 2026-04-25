from rest_framework import serializers

from .models import ExecutionJob, ManagedServer


class ManagedServerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ManagedServer
        fields = (
            "id",
            "name",
            "slug",
            "base_url",
            "role",
            "is_active",
            "is_default",
            "capabilities",
            "last_seen_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("slug", "last_seen_at", "created_at", "updated_at")


class ManagedServerWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ManagedServer
        fields = (
            "id",
            "name",
            "slug",
            "base_url",
            "role",
            "shared_secret",
            "is_active",
            "is_default",
            "capabilities",
        )


class ExecutionJobSerializer(serializers.ModelSerializer):
    server = ManagedServerSerializer(read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.username", read_only=True)

    class Meta:
        model = ExecutionJob
        fields = (
            "id",
            "server",
            "requested_by",
            "requested_by_name",
            "operation",
            "target_type",
            "target_name",
            "payload",
            "status",
            "dry_run",
            "agent_request_id",
            "result",
            "stdout",
            "stderr",
            "started_at",
            "finished_at",
            "created_at",
        )
        read_only_fields = fields
