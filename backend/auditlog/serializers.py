from rest_framework import serializers

from .models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "actor_name",
            "username_snapshot",
            "action",
            "target_type",
            "target_id",
            "status",
            "metadata",
            "remote_addr",
            "created_at",
            "category",
            "severity",
            "source",
        )
