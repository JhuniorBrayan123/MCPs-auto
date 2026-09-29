import os
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

import re
import pyodbc
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

# Cargar variables de entorno desde la ruta absoluta del proyecto
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# --- Reglas de Seguridad para Consultas ---
FORBIDDEN_KEYWORDS = (
    "INSERT", "UPDATE", "DELETE", "MERGE", "DROP", "ALTER", "CREATE", 
    "TRUNCATE", "EXEC", "EXECUTE", "GRANT", "REVOKE", "DENY", "BACKUP", 
    "RESTORE", "DBCC", "SHUTDOWN", "INTO"
)
FORBIDDEN_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in FORBIDDEN_KEYWORDS) + r")\b",
    re.IGNORECASE,
)
ALLOWED_START_PATTERN = re.compile(r"^\s*(SELECT|WITH)\b", re.IGNORECASE)

def _mask_sql(sql: str) -> str:
    """Enmascara comentarios y strings literales para evitar falsos positivos en el escaneo de seguridad."""
    result = []
    i = 0
    length = len(sql)
    in_single_quote, in_double_quote, in_bracket, in_line_comment, in_block_comment = False, False, False, False, False

    while i < length:
        c = sql[i]
        next_c = sql[i + 1] if i + 1 < length else ""

        if in_line_comment:
            if c == "\n":
                in_line_comment = False
                result.append("\n")
            else:
                result.append(" ")
            i += 1
            continue

        if in_block_comment:
            if c == "*" and next_c == "/":
                in_block_comment = False
                result.extend("  ")
                i += 2
            else:
                result.append("\n" if c == "\n" else " ")
                i += 1
            continue

        if in_single_quote:
            if c == "'" and next_c == "'":
                result.extend("  ")
                i += 2
                continue
            if c == "'":
                in_single_quote = False
            result.append(" ")
            i += 1
            continue

        if in_double_quote:
            if c == '"':
                in_double_quote = False
            result.append(" ")
            i += 1
            continue

        if in_bracket:
            if c == "]":
                in_bracket = False
            result.append(" ")
            i += 1
            continue

        if c == "-" and next_c == "-":
            in_line_comment = True
            result.extend("  ")
            i += 2
            continue

        if c == "/" and next_c == "*":
            in_block_comment = True
            result.extend("  ")
            i += 2
            continue

        if c == "'":
            in_single_quote = True
            result.append(" ")
            i += 1
            continue

        if c == '"':
            in_double_quote = True
            result.append(" ")
            i += 1
            continue

        if c == "[":
            in_bracket = True
            result.append(" ")
            i += 1
            continue

        result.append(c)
        i += 1

    return "".join(result)

def _validar_consulta_segura(query: str) -> str:
    """Valida que la consulta sea estrictamente de solo lectura."""
    if not query or not query.strip():
        raise ValueError("La consulta no puede estar vacia.")

    masked = _mask_sql(query)
    
    # Prevenir inyecciones por lotes dividiendo por punto y coma
    statements = [part.strip() for part in masked.split(";") if part.strip()]
    if len(statements) > 1:
        raise ValueError("Solo se permite una unica instruccion SQL (sin punto y coma multiple).")

    normalized = statements[0] if statements else ""
    
    if not ALLOWED_START_PATTERN.match(normalized):
        raise ValueError("Solo se permiten consultas que comiencen con SELECT o WITH.")

    forbidden_match = FORBIDDEN_PATTERN.search(normalized)
    if forbidden_match:
        raise ValueError(f"Comando destructivo o prohibido detectado: {forbidden_match.group(1).upper()}.")

    return query.strip()

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

# Inicializar servidor MCP
mcp = FastMCP("SQLServer-PuntoVenta-MCP")

@mcp.tool()
def listar_stored_procedures(base_datos: str, servidor: str = None) -> dict[str, Any]:
    """Lista todos los Stored Procedures disponibles en una base de datos específica. Argumento 'servidor' (PV o SOPORTE) es opcional y solo debe usarse si la base de datos está en múltiples servidores."""
    query = "SELECT name, create_date, modify_date FROM sys.objects WHERE type = 'P' ORDER BY name"
    try:
        with obtener_conexion_dinamica(base_datos, servidor) as connection:
            cursor = connection.cursor()
            cursor.execute(query)
            
            if cursor.description is None:
                return {"status": "success", "base_datos": base_datos, "count": 0, "procedures": []}
                
            column_names = [column[0] for column in cursor.description]
            rows = cursor.fetchall()
            
            result_rows = [
                {column_names[index]: _to_json_serializable(value) for index, value in enumerate(row)}
                for row in rows
            ]
            return {
                "status": "success",
                "base_datos": base_datos,
                "count": len(result_rows),
                "procedures": result_rows
            }
    except Exception as e:
        return {"status": "error", "message": f"Error al listar Stored Procedures en {base_datos}: {str(e)}"}

@mcp.tool()
def obtener_definicion_sp(base_datos: str, nombre_sp: str, servidor: str = None) -> dict[str, Any]:
    """Obtiene el codigo fuente (definicion) de un Stored Procedure especifico para auditarlo. Argumento 'servidor' (PV o SOPORTE) opcional para bases duplicadas."""
    query = """
        SELECT sm.definition 
        FROM sys.sql_modules sm 
        JOIN sys.objects o ON sm.object_id = o.object_id 
        WHERE o.name = ? 
    """
    try:
        with obtener_conexion_dinamica(base_datos, servidor) as connection:
            cursor = connection.cursor()
            cursor.execute(query, (nombre_sp,))
            row = cursor.fetchone()
            
            if row:
                return {
                    "status": "success",
                    "base_datos": base_datos,
                    "sp_name": nombre_sp,
                    "definition": row[0]
                }
            else:
                return {"status": "not_found", "message": f"No se encontro el Stored Procedure: {nombre_sp} en {base_datos}"}
    except Exception as e:
        return {"status": "error", "message": f"Error al obtener definicion de {nombre_sp} en {base_datos}: {str(e)}"}

@mcp.tool()
def obtener_columnas_tabla(base_datos: str, nombre_tabla: str, servidor: str = None) -> dict[str, Any]:
    """Obtiene la lista de columnas y sus tipos de datos para una tabla específica. Argumento 'servidor' (PV o SOPORTE) opcional para bases duplicadas."""
    query = """
        SELECT 
            c.name AS Columna, 
            t.name AS TipoDato, 
            c.max_length AS Longitud, 
            c.is_nullable AS PermiteNulos
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(?)
    """
    try:
        with obtener_conexion_dinamica(base_datos, servidor) as connection:
            cursor = connection.cursor()
            cursor.execute(query, (nombre_tabla,))
            
            if cursor.description is None:
                return {"status": "success", "base_datos": base_datos, "count": 0, "columnas": []}
                
            column_names = [column[0] for column in cursor.description]
            rows = cursor.fetchall()
            
            result_rows = [
                {column_names[index]: _to_json_serializable(value) for index, value in enumerate(row)}
                for row in rows
            ]
            
            if not result_rows:
                return {"status": "not_found", "message": f"No se encontró la tabla o no tiene columnas: {nombre_tabla}"}
                
            return {
                "status": "success",
                "base_datos": base_datos,
                "tabla": nombre_tabla,
                "count": len(result_rows),
                "columnas": result_rows
            }
    except Exception as e:
        return {"status": "error", "message": f"Error al obtener columnas de {nombre_tabla} en {base_datos}: {str(e)}"}

@mcp.tool()
def obtener_indices_tabla(base_datos: str, nombre_tabla: str, servidor: str = None) -> dict[str, Any]:
    """Obtiene la lista de índices y las columnas que los componen para una tabla específica. Argumento 'servidor' (PV o SOPORTE) opcional para bases duplicadas."""
    query = """
        SELECT 
            i.name AS NombreIndice, 
            i.type_desc AS Tipo, 
            i.is_unique AS EsUnico,
            STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS Columnas
        FROM sys.indexes i
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE i.object_id = OBJECT_ID(?)
        GROUP BY i.name, i.type_desc, i.is_unique
    """
    try:
        with obtener_conexion_dinamica(base_datos, servidor) as connection:
            cursor = connection.cursor()
            cursor.execute(query, (nombre_tabla,))
            
            if cursor.description is None:
                return {"status": "success", "base_datos": base_datos, "count": 0, "indices": []}
                
            column_names = [column[0] for column in cursor.description]
            rows = cursor.fetchall()
            
            result_rows = [
                {column_names[index]: _to_json_serializable(value) for index, value in enumerate(row)}
                for row in rows
            ]
            
            return {
                "status": "success",
                "base_datos": base_datos,
                "tabla": nombre_tabla,
                "count": len(result_rows),
                "indices": result_rows
            }
    except Exception as e:
        return {"status": "error", "message": f"Error al obtener indices de {nombre_tabla} en {base_datos}: {str(e)}"}

@mcp.tool()
def ejecutar_consulta_segura(base_datos: str, query: str, servidor: str = None) -> dict[str, Any]:
    """
    Ejecuta una consulta SQL estructurada y de solo lectura. Argumento 'servidor' opcional.
    La consulta DEBE empezar con SELECT o WITH.
    Devolvera un maximo de 200 filas para proteger el servidor.
    """
    try:
        validated_query = _validar_consulta_segura(query)
        max_rows = 200
        
        with obtener_conexion_dinamica(base_datos, servidor) as connection:
            cursor = connection.cursor()
            cursor.execute(validated_query)
            
            if cursor.description is None:
                return {"status": "success", "base_datos": base_datos, "count": 0, "rows": [], "message": "Consulta sin resultados"}
                
            # Limpiar nombres de columnas duplicados
            raw_column_names = [column[0] for column in cursor.description]
            seen = {}
            column_names = []
            for name in raw_column_names:
                base = name or "column"
                count = seen.get(base, 0)
                if count == 0:
                    column_names.append(base)
                else:
                    column_names.append(f"{base}_{count+1}")
                seen[base] = count + 1

            fetched_rows = cursor.fetchmany(max_rows + 1)
            
            truncated = len(fetched_rows) > max_rows
            rows_to_return = fetched_rows[:max_rows]
            
            result_rows = [
                {column_names[index]: _to_json_serializable(value) for index, value in enumerate(row)}
                for row in rows_to_return
            ]
            
            return {
                "status": "success",
                "base_datos": base_datos,
                "count": len(result_rows),
                "truncated": truncated,
                "max_rows_limit": max_rows,
                "rows": result_rows
            }
    except Exception as e:
        return {"status": "error", "message": f"Error de SQL: {str(e)}"}

if __name__ == "__main__":
    mcp.run()
