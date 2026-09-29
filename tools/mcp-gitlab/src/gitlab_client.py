import os

import requests

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
    return project_path.replace("/", "%2F")
