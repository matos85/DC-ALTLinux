from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DashboardSummaryView, ExecutionJobViewSet, ManagedServerViewSet


router = DefaultRouter()
router.register("servers", ManagedServerViewSet, basename="managed-server")
router.register("", ExecutionJobViewSet, basename="execution-job")

urlpatterns = [
    path("summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("", include(router.urls)),
]
