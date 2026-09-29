from urllib.parse import urlsplit

from .server import create_server


def run() -> None:
    mcp, auth_settings = create_server()

    if auth_settings.mcp_transport == "stdio":
        mcp.run()
    elif auth_settings.mcp_transport == "streamable-http":
        mcp_path = urlsplit(auth_settings.mcp_public_url).path or "/mcp"
        mcp.run(
            "streamable-http",
            host=auth_settings.mcp_host,
            port=auth_settings.mcp_port,
            streamable_http_path=mcp_path,
        )
    else:
        raise RuntimeError(f"Unsupported MCP_TRANSPORT: {auth_settings.mcp_transport!r}")
