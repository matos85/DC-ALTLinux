from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAuditorOrHigher

from .models import AuditEvent
from .serializers import AuditEventSerializer


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditEvent.objects.select_related("actor").all()
    serializer_class = AuditEventSerializer
    permission_classes = [IsAuthenticated, IsAuditorOrHigher]

    def get_queryset(self):
        qs = super().get_queryset()
        cat = (self.request.query_params.get("category") or "").strip()
        if cat:
            qs = qs.filter(category=cat)
        sev = (self.request.query_params.get("severity") or "").strip()
        if sev:
            qs = qs.filter(severity=sev)
        src = (self.request.query_params.get("source") or "").strip()
        if src:
            qs = qs.filter(source=src)
        return qs
