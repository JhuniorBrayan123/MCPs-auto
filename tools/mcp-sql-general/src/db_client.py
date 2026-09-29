import os
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

import pyodbc


def _parse_bool(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return True


def _parse_positive_int(value: str, env_name: str) -> int:
    try:
        parsed = int(value)
    except ValueError:
        return 30
    if parsed <= 0:
        return 30
    return parsed


def obtener_conexion_dinamica(base_datos: str, servidor: str = None) -> pyodbc.Connection:
    """Obtiene una conexión segura y dinámica mapeando la BD a su servidor físico y credenciales."""
    db_upper = base_datos.strip().upper()

    # 1. Encontrar el servidor asociado a esta BD (considerando si hay parámetro servidor)
    if servidor:
        srv_upper = servidor.strip().upper()

        # --- NORMALIZADOR DE ALIAS ---
        # Permite a Claude (o al usuario) escribir como quiera, el sistema lo corrige.
        if srv_upper in ["PUNTOVENTA", "PUNTO VENTA", "PV", "PUNTO_VENTA"]:
            srv_upper = "PV"
        elif srv_upper in ["SOPORTE", "SOPORTECRT"]:
            srv_upper = "SOPORTE"

        server_env_key = f"MAP_{db_upper}_{srv_upper}_SERVER"
        user_env_key = f"CRED_{db_upper}_{srv_upper}_USER"
        pass_env_key = f"CRED_{db_upper}_{srv_upper}_PASSWORD"
    else:
        server_env_key = f"MAP_{db_upper}_SERVER"
        user_env_key = f"CRED_{db_upper}_USER"
        pass_env_key = f"CRED_{db_upper}_PASSWORD"

    server_name = os.getenv(server_env_key)
    if not server_name:
        if servidor:
            raise ValueError(f"Base de datos '{base_datos}' en el servidor '{servidor}' no está mapeada en la configuración (.env). Falta {server_env_key}")
        else:
            raise ValueError(
                f"ERROR CRÍTICO PARA LA IA: La base de datos '{base_datos}' no tiene una conexión por defecto. "
                f"Esto significa que es una base de datos repetida. DETENTE INMEDIATAMENTE y pregúntale al usuario "
                f"a qué conexión/servidor desea ir (por ejemplo: 'PuntoVenta' o 'Soporte'). Luego, usa el parámetro 'servidor'."
                f"Opciones de servidor: 'PuntoVenta' o 'Soporte'."
            )

    # 2. Encontrar el host del servidor
    host_env_key = f"{server_name}_HOST"
    host = os.getenv(host_env_key)
    if not host:
        raise ValueError(f"No se encontró el host para el servidor {server_name}. Falta {host_env_key}")

    # 3. Encontrar credenciales
    user = os.getenv(user_env_key)
    password = os.getenv(pass_env_key)

    if not user or not password:
        raise ValueError(f"Faltan credenciales para la base de datos '{base_datos}'. Revisar {user_env_key} y {pass_env_key}")

    # 4. Configuración general
    driver = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server").strip("{} ")
    trust_cert = _parse_bool(os.getenv("SQLSERVER_TRUST_CERT", "true"))
    query_timeout = _parse_positive_int(os.getenv("QUERY_TIMEOUT_SECONDS", "30"), "QUERY_TIMEOUT_SECONDS")

    # 5. Construir y retornar conexión
    connection_string = (
        f"DRIVER={{{driver}}};"
        f"SERVER={host};"
        f"DATABASE={base_datos};"
        f"UID={user};"
        f"PWD={password};"
        "Encrypt=yes;"
        f"TrustServerCertificate={'yes' if trust_cert else 'no'};"
        "ApplicationIntent=ReadOnly;"
    )

    return pyodbc.connect(
        connection_string,
        autocommit=True,
        timeout=query_timeout
    )


def _to_json_serializable(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, UUID):
        return str(value)
    return str(value)
