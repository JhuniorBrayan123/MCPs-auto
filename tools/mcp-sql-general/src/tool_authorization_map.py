from __future__ import annotations

from mcp_cognito_avp import ToolAuthorization, ToolAuthorizationMap

TOOL_AUTHORIZATION_MAP: ToolAuthorizationMap = {
    "listar_stored_procedures": ToolAuthorization(
        action="list", resource_type="Database", id_arg="base_datos"
    ),
    "obtener_definicion_sp": ToolAuthorization(
        action="view", resource_type="Database", id_arg="base_datos"
    ),
    "obtener_columnas_tabla": ToolAuthorization(
        action="view", resource_type="Database", id_arg="base_datos"
    ),
    "obtener_indices_tabla": ToolAuthorization(
        action="view", resource_type="Database", id_arg="base_datos"
    ),
    "ejecutar_consulta_segura": ToolAuthorization(
        action="query", resource_type="Database", id_arg="base_datos"
    ),
}
