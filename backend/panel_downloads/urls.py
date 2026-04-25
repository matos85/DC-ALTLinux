from django.urls import path, re_path

from .views import (
    AgentBundleDownloadView,
    AgentInstallInfoView,
    JoinWorkstationScriptDownloadView,
    ProvisionDcScriptDownloadView,
)

urlpatterns = [
    path("bundle/", AgentBundleDownloadView.as_view(), name="agent-bundle"),
    # С завершающим / и без — чтобы прокси Next.js не ломал путь.
    re_path(r"^join-workstation\.sh/?$", JoinWorkstationScriptDownloadView.as_view(), name="agent-join-workstation-script"),
    re_path(r"^provision-dc\.sh/?$", ProvisionDcScriptDownloadView.as_view(), name="agent-provision-dc-script"),
    path("install-info/", AgentInstallInfoView.as_view(), name="agent-install-info"),
]
