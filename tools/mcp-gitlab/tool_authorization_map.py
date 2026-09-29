from __future__ import annotations

from mcp_cognito_avp import ToolAuthorization, ToolAuthorizationMap

TOOL_AUTHORIZATION_MAP: ToolAuthorizationMap = {
    "list_merge_requests": ToolAuthorization(
        action="list", resource_type="Project", id_arg="project_path"
    ),
    "search_projects": ToolAuthorization(action="search", resource_type="Project"),
    "get_repository_tree": ToolAuthorization(
        action="view", resource_type="Project", id_arg="project_path"
    ),
    "get_file_content": ToolAuthorization(
        action="view", resource_type="Project", id_arg="project_path"
    ),
    "get_merge_request": ToolAuthorization(
        action="view", resource_type="MergeRequest", id_arg="mr_iid", project_arg="project_path"
    ),
    "get_merge_request_comments": ToolAuthorization(
        action="view", resource_type="MergeRequest", id_arg="mr_iid", project_arg="project_path"
    ),
    "get_merge_request_pipelines": ToolAuthorization(
        action="view", resource_type="MergeRequest", id_arg="mr_iid", project_arg="project_path"
    ),
    "get_conflicting_files": ToolAuthorization(
        action="view", resource_type="MergeRequest", id_arg="mr_iid", project_arg="project_path"
    ),
    "get_merge_request_diff": ToolAuthorization(
        action="view_diff",
        resource_type="MergeRequest",
        id_arg="mr_iid",
        project_arg="project_path",
    ),
    "approve_merge_request": ToolAuthorization(
        action="approve", resource_type="MergeRequest", id_arg="mr_iid", project_arg="project_path"
    ),
    "create_merge_request": ToolAuthorization(
        action="create", resource_type="MergeRequest", project_arg="project_path"
    ),
    "update_merge_request": ToolAuthorization(
        action="update", resource_type="MergeRequest", id_arg="mr_iid", project_arg="project_path"
    ),
}
