from django.urls import path

from .views import (
    ComputersView,
    DirectorySummaryView,
    DnsRecordsView,
    JoinCommandView,
    OrganizationalUnitsView,
    SambaGroupActionView,
    SambaGroupMembersView,
    SambaGroupsView,
    SambaUserActionView,
    SambaUsersView,
    ShareAclView,
    ShareAuditAgentPullView,
    ShareAuditConfigView,
    ShareDetailView,
    SharesView,
)


urlpatterns = [
    path("summary/", DirectorySummaryView.as_view(), name="directory-summary"),
    path("users/", SambaUsersView.as_view(), name="directory-users"),
    path("users/<str:username>/<str:action_name>/", SambaUserActionView.as_view(), name="directory-user-action"),
    path("groups/", SambaGroupsView.as_view(), name="directory-groups"),
    path("groups/<str:name>/members/", SambaGroupMembersView.as_view(), name="directory-group-members"),
    path("groups/<str:name>/<str:action_name>/", SambaGroupActionView.as_view(), name="directory-group-action"),
    path("computers/", ComputersView.as_view(), name="directory-computers"),
    path("ous/", OrganizationalUnitsView.as_view(), name="directory-ous"),
    path("dns/records/", DnsRecordsView.as_view(), name="directory-dns"),
    path("shares/", SharesView.as_view(), name="directory-shares"),
    path("shares/audit/config/", ShareAuditConfigView.as_view(), name="directory-share-audit-config"),
    path("shares/audit/agent-pull/", ShareAuditAgentPullView.as_view(), name="directory-share-audit-pull"),
    path("shares/<str:name>/", ShareDetailView.as_view(), name="directory-share-detail"),
    path("shares/<str:name>/acl/", ShareAclView.as_view(), name="directory-share-acl"),
    path("join-command/", JoinCommandView.as_view(), name="directory-join-command"),
]
