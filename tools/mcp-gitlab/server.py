import os
import json
import requests
from dotenv import load_dotenv
from pathlib import Path
# Carga el .env de la RAÍZ del proyecto por ruta explícita como ÚNICA fuente
# de credenciales, sin depender del cwd ni de la inyección de OpenCode. Desde
# tools/mcp-gitlab/, parents[2] es la raíz del repo (tools/.. / .. / .env).
# python-dotenv no sobreescribe variables ya seteadas (override=False): si
# OpenCode inyecta valores válidos, esos ganan; si no inyecta nada, este lo toma.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")
# Fallback suave: .env del cwd (solo para ejecución manual puntual).
load_dotenv()
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("gitlab-mcp")

GITLAB_URL = os.getenv("GITLAB_URL", "").rstrip("/")
GITLAB_TOKEN = os.getenv("GITLAB_TOKEN", "")

HEADERS = {"PRIVATE-TOKEN": GITLAB_TOKEN}


def api_get(path: str, params: dict = None):
    url = f"{GITLAB_URL}/api/v4{path}"
    response = requests.get(url, headers=HEADERS, params=params or {}, verify=True, timeout=30)
    response.raise_for_status()
    return response.json()


def api_post(path: str, params: dict = None):
    url = f"{GITLAB_URL}/api/v4{path}"
    response = requests.post(url, headers=HEADERS, params=params or {}, verify=True, timeout=30)
    response.raise_for_status()
    return response.json() if response.text else {}

def api_put(path: str, params: dict = None):
    url = f"{GITLAB_URL}/api/v4{path}"
    response = requests.put(url, headers=HEADERS, params=params or {}, verify=True, timeout=30)
    response.raise_for_status()
    return response.json() if response.text else {}


def encode_project(project_path: str) -> str:
    # GitLab requiere el path del proyecto URL-encoded, ej: grupo/erp-mf-header -> grupo%2Ferp-mf-header
    return project_path.replace("/", "%2F")


@mcp.tool()
def list_merge_requests(project_path: str, state: str = "opened") -> str:
    """
    Lista los merge requests de un proyecto.
    project_path: path completo del proyecto, ej 'grupo/erp-mf-header'.
    state: 'opened', 'closed', 'merged', 'all'.
    """
    project_id = encode_project(project_path)
    mrs = api_get(f"/projects/{project_id}/merge_requests", {"state": state, "per_page": 50})
    result = [
        {
            "iid": mr["iid"],
            "title": mr["title"],
            "author": mr["author"]["username"],
            "source_branch": mr["source_branch"],
            "target_branch": mr["target_branch"],
            "state": mr["state"],
            "created_at": mr["created_at"],
            "web_url": mr["web_url"],
        }
        for mr in mrs
    ]
    return json.dumps(result, indent=2)


@mcp.tool()
def get_merge_request(project_path: str, mr_iid: int) -> str:
    """
    Devuelve el detalle completo de un MR: título, descripción, estado,
    autor, ramas, si tiene conflictos, y approvals si están disponibles.
    """
    project_id = encode_project(project_path)
    mr = api_get(f"/projects/{project_id}/merge_requests/{mr_iid}")
    result = {
        "iid": mr["iid"],
        "title": mr["title"],
        "description": mr["description"],
        "author": mr["author"]["username"],
        "state": mr["state"],
        "source_branch": mr["source_branch"],
        "target_branch": mr["target_branch"],
        "has_conflicts": mr.get("has_conflicts", False),
        "merge_status": mr.get("merge_status"),
        "web_url": mr["web_url"],
    }
    return json.dumps(result, indent=2)


@mcp.tool()
def get_merge_request_diff(project_path: str, mr_iid: int) -> str:
    """
    Devuelve el diff (cambios de código) de un MR: archivos modificados
    y el contenido del diff de cada uno.
    """
    project_id = encode_project(project_path)
    changes = api_get(f"/projects/{project_id}/merge_requests/{mr_iid}/changes")
    result = [
        {
            "file": c["new_path"],
            "diff": c["diff"],
        }
        for c in changes.get("changes", [])
    ]
    return json.dumps(result, indent=2)


@mcp.tool()
def get_merge_request_comments(project_path: str, mr_iid: int) -> str:
    """
    Devuelve los comentarios / notas de code review de un MR.
    """
    project_id = encode_project(project_path)
    notes = api_get(f"/projects/{project_id}/merge_requests/{mr_iid}/notes", {"per_page": 100})
    result = [
        {
            "author": n["author"]["username"],
            "body": n["body"],
            "created_at": n["created_at"],
            "resolved": n.get("resolved", None),
        }
        for n in notes
        if not n.get("system", False)
    ]
    return json.dumps(result, indent=2)


@mcp.tool()
def get_merge_request_pipelines(project_path: str, mr_iid: int) -> str:
    """
    Devuelve el estado de los pipelines (CI/CD) de un MR: si pasaron,
    fallaron, o están en progreso.
    """
    project_id = encode_project(project_path)
    pipelines = api_get(f"/projects/{project_id}/merge_requests/{mr_iid}/pipelines")
    result = [
        {
            "id": p["id"],
            "status": p["status"],
            "ref": p["ref"],
            "created_at": p["created_at"],
            "web_url": p["web_url"],
        }
        for p in pipelines
    ]
    return json.dumps(result, indent=2)


@mcp.tool()
def get_conflicting_files(project_path: str, mr_iid: int) -> str:
    """
    Devuelve la lista de archivos con conflicto en un MR, útil antes
    de resolver un merge conflict manualmente. Si el MR no tiene
    conflictos, devuelve una lista vacía.
    """
    project_id = encode_project(project_path)
    try:
        conflicts = api_get(f"/projects/{project_id}/merge_requests/{mr_iid}/conflicts")
        files = [f.get("new_path", f.get("old_path")) for f in conflicts.get("files", [])]
        return json.dumps({"has_conflicts": True, "files": files}, indent=2)
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 406:
            return json.dumps({"has_conflicts": False, "files": []}, indent=2)
        return json.dumps({"error": str(e)}, indent=2)


@mcp.tool()
def approve_merge_request(project_path: str, mr_iid: int) -> str:
    """
    Aprueba un merge request. ACCIÓN DE ESCRITURA: solo ejecutar cuando
    el usuario lo pida explícitamente para ese MR puntual, nunca de forma
    automática o especulativa. Requiere token con scope 'api' (no alcanza
    con 'read_api').
    """
    project_id = encode_project(project_path)
    try:
        result = api_post(f"/projects/{project_id}/merge_requests/{mr_iid}/approve")
        return json.dumps({"success": True, "detail": result}, indent=2)
    except requests.exceptions.HTTPError as e:
        return json.dumps({"success": False, "error": str(e)}, indent=2)


@mcp.tool()
def search_projects(query: str) -> str:
    """
    Busca proyectos en GitLab por nombre, para encontrar el project_path
    exacto que necesitás usar en las demás tools.
    """
    projects = api_get("/projects", {"search": query, "per_page": 20, "membership": True})
    result = [
        {"name": p["name"], "path_with_namespace": p["path_with_namespace"], "web_url": p["web_url"]}
        for p in projects
    ]
    return json.dumps(result, indent=2)

@mcp.tool()
def create_merge_request(
    project_path: str,
    source_branch: str,
    target_branch: str,
    title: str,
    description: str = "",
    reviewer_usernames: list[str] = None,
) -> str:
    """
    Crea un nuevo merge request. ACCIÓN DE ESCRITURA: ejecutar solo
    cuando el usuario lo pida explícitamente con los datos confirmados
    (rama origen, rama destino, título).
    """
    project_id = encode_project(project_path)
    params = {
        "source_branch": source_branch,
        "target_branch": target_branch,
        "title": title,
        "description": description,
    }
    if reviewer_usernames:
        # GitLab necesita IDs numéricos, no usernames, para reviewer_ids
        reviewer_ids = []
        for username in reviewer_usernames:
            users = api_get("/users", {"username": username})
            if users:
                reviewer_ids.append(users[0]["id"])
        if reviewer_ids:
            params["reviewer_ids"] = ",".join(map(str, reviewer_ids))

    result = api_post(f"/projects/{project_id}/merge_requests", params)
    return json.dumps({"success": True, "iid": result.get("iid"), "web_url": result.get("web_url")}, indent=2)


@mcp.tool()
def update_merge_request(
    project_path: str,
    mr_iid: int,
    reviewer_usernames: list[str] = None,
    assignee_username: str = None,
    title: str = None,
    description: str = None,
) -> str:
    """
    Actualiza un MR existente: cambia revisor(es), asignado, título o
    descripción. ACCIÓN DE ESCRITURA: solo con confirmación explícita
    del usuario sobre qué campo cambiar.
    """
    project_id = encode_project(project_path)
    params = {}

    if reviewer_usernames:
        reviewer_ids = []
        for username in reviewer_usernames:
            users = api_get("/users", {"username": username})
            if users:
                reviewer_ids.append(users[0]["id"])
        if reviewer_ids:
            params["reviewer_ids"] = ",".join(map(str, reviewer_ids))

    if assignee_username:
        users = api_get("/users", {"username": assignee_username})
        if users:
            params["assignee_id"] = users[0]["id"]

    if title:
        params["title"] = title
    if description:
        params["description"] = description

    if not params:
        return json.dumps({"error": "No se especificó ningún campo para actualizar"})

    result = api_put(f"/projects/{project_id}/merge_requests/{mr_iid}", params)
    return json.dumps({"success": True, "iid": result.get("iid"), "web_url": result.get("web_url")}, indent=2)


@mcp.tool()
def get_repository_tree(project_path: str, ref: str = None, path: str = "", recursive: bool = False) -> str:
    """
    Lista los archivos y carpetas de un repositorio de GitLab (SOLO LECTURA).
    project_path: path completo del proyecto, ej 'GU-CalidadTI/erpperu2-automation'.
    ref: rama o tag o SHA. Si no se pasa, usa la rama por defecto del proyecto.
    path: subcarpeta opcional dentro del repo, ej 'src/pages' (vacío = raíz).
    recursive: si es True, devuelve todo el árbol de forma recursiva.
    """
    project_id = encode_project(project_path)
    params = {"per_page": 100}
    if ref:
        params["ref"] = ref
    if path:
        params["path"] = path
    if recursive:
        params["recursive"] = True
    items = api_get(f"/projects/{project_id}/repository/tree", params)
    result = [{"type": i["type"], "path": i["path"]} for i in items]
    return json.dumps(result, indent=2)


@mcp.tool()
def get_file_content(project_path: str, file_path: str, ref: str = None) -> str:
    """
    Lee el contenido de un archivo de un repositorio de GitLab (SOLO LECTURA).
    project_path: path completo del proyecto, ej 'GU-CalidadTI/erpperu2-automation'.
    file_path: ruta del archivo dentro del repo, ej 'src/pages/PostEmisionPage.ts' o 'package.json'.
    ref: rama o tag o SHA. Si no se pasa, usa la rama por defecto del proyecto.
    Devuelve el contenido crudo del archivo.
    """
    from urllib.parse import quote
    project_id = encode_project(project_path)
    encoded_path = quote(file_path, safe="")
    url = f"{GITLAB_URL}/api/v4/projects/{project_id}/repository/files/{encoded_path}/raw"
    if ref:
        url += f"?ref={quote(ref, safe='')}"
    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        if response.status_code == 404:
            return json.dumps({"error": f"Archivo '{file_path}' no encontrado en ref '{ref or 'default'}'"}, indent=2)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        return json.dumps({"error": f"Error leyendo '{file_path}': {str(e)}"}, indent=2)


if __name__ == "__main__":
    mcp.run(transport="stdio")
