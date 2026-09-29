from mcp.server.mcpserver import MCPServer
from mcp_cognito_avp import CognitoAvpSettings, build_cognito_avp_auth
from starlette.requests import Request
from starlette.responses import PlainTextResponse

from .tool_authorization_map import TOOL_AUTHORIZATION_MAP
from .tools import register_tools

HEALTH_CHECK_PATH = "/api/v1/conectividades"


def create_server() -> tuple[MCPServer, CognitoAvpSettings]:
    auth_settings = CognitoAvpSettings()
    auth = build_cognito_avp_auth(auth_settings, tool_map=TOOL_AUTHORIZATION_MAP)

    mcp = MCPServer(
        "SQLServer-PuntoVenta-MCP",
        middleware=[auth.middleware] if auth.middleware else [],
        **auth.auth_kwargs,
    )

    @mcp.custom_route(HEALTH_CHECK_PATH, methods=["GET"])  # type: ignore[untyped-decorator]
    async def health(_: Request) -> PlainTextResponse:
        return PlainTextResponse("ok")

    auth.register_routes(mcp)
    register_tools(mcp)

    return mcp, auth_settings
