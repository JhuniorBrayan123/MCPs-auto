from typing import Any

from .db_client import _to_json_serializable, obtener_conexion_dinamica
from .sql_safety import _validar_consulta_segura


def register_tools(mcp) -> None:
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
