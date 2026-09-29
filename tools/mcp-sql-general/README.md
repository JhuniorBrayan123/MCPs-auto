# Servidor MCP de Auditoria para SQL Server

Este proyecto implementa un servidor Model Context Protocol (MCP) en Python, diseñado especificamente para permitir a agentes de Inteligencia Artificial auditar bases de datos SQL Server de forma segura. Esta optimizado para flujos de integracion continua (CI/CD) usando herramientas como n8n y modelos de lenguaje (LLMs).

## Arquitectura

El servidor utiliza una arquitectura de **Llavero Dinamico Centralizado** basada en Clean Architecture.
En lugar de permitir la ejecucion de consultas SQL arbitrarias (lo que supone un riesgo de inyeccion SQL o modificacion accidental de datos), el servidor proporciona un conjunto cerrado de herramientas de solo lectura.

El enrutamiento de las conexiones es dinamico: la IA solo provee el nombre de la base de datos a auditar, y el codigo backend lee la configuracion en el archivo `.env` para resolver a que servidor fisico (Host) pertenece esa base de datos y que credenciales aisladas debe utilizar.

## Requisitos Previos

- Python 3.10 o superior
- Controlador ODBC instalado en el sistema operativo: `ODBC Driver 17 for SQL Server` (o version superior).

## Instalacion "Plug & Play" (Caso archivo ZIP)

Hemos preparado un instalador automatico para Windows que se encarga de todo el trabajo pesado. Solo debe seguir estos pasos:

1. Descomprima el archivo ZIP del proyecto en cualquier carpeta. **¡IMPORTANTE! Si el ZIP incluia una carpeta llamada `venv`, borrela por completo antes de continuar**, ya que los entornos virtuales de Python no se pueden transferir entre computadoras.
2. Haga **doble clic en el archivo `instalar.bat`**.

¿Que hace este script por usted?
- Crea un entorno virtual de Python automaticamente (nuevo, limpio y adaptado a su propia computadora).
- Descarga e instala todas las dependencias necesarias.
- Clona la plantilla del Llavero Dinamico creando su archivo `.env` local.
- **Magia:** Detecta su instalacion de Claude Desktop y vincula el servidor MCP automaticamente con las rutas absolutas correctas.

3. Abra el archivo `.env` recien creado y configure las credenciales de acceso de sus bases de datos.
4. Reinicie por completo la aplicacion Claude Desktop.

### ¿Que hacer si el script falla al configurar Claude?

A veces las politicas de Windows o los antivirus bloquean el script. Si es asi, solo debe configurar Claude manualmente:

1. En Claude Desktop, vaya a `File` -> `Settings` -> `Developer` -> `Edit Config`.
2. Asegurese de que exista el bloque `"mcpServers"` y agregue esta configuracion, reemplazando `C:\\Ruta\\Exacta` por la ruta real donde guardo la carpeta. **(Obligatorio usar dobles barras `\\`)**:

```json
{
  "mcpServers": {
    "sql-auditor": {
      "command": "C:\\Ruta\\Exacta\\venv\\Scripts\\python.exe",
      "args": [
        "C:\\Ruta\\Exacta\\server.py"
      ]
    }
  }
}
```
3. Guarde el archivo y reinicie Claude Desktop.

## Instalacion Manual (Para n8n o Linux)

Si planea desplegar el proyecto en un servidor CI/CD o usar n8n en lugar de Claude Desktop, realice los pasos estandar:

1. **Crear y activar el entorno virtual:**
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   ```

2. **Instalar dependencias:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configuracion y variables (.env):**
   ```bash
   copy .env.example .env
   ```
   Edite el `.env` con las IP y usuarios correctos.
   
4. **Enlazar con n8n:**
   En la configuracion de MCP de n8n, utilice el comando apuntando al ejecutable del entorno virtual creado y envie como argumento la ruta absoluta de `server.py`.

## Herramientas Proporcionadas al Agente IA

El servidor expone 5 herramientas especificas para la auditoria de estructuras y codigo:

1. **listar_stored_procedures(base_datos)**: Retorna un listado completo de los Stored Procedures existentes en la base de datos solicitada.
2. **obtener_definicion_sp(base_datos, nombre_sp)**: Retorna el codigo fuente exacto de un Stored Procedure para su lectura y analisis.
3. **obtener_columnas_tabla(base_datos, nombre_tabla)**: Retorna el esquema de una tabla (nombres de columnas, tipos de datos, longitud y nulabilidad).
4. **obtener_indices_tabla(base_datos, nombre_tabla)**: Retorna los indices existentes de una tabla y sus columnas asociadas, util para que la IA identifique oportunidades de optimizacion en consultas.
5. **ejecutar_consulta_segura(base_datos, query)**: Ejecuta consultas crudas enviadas por la IA con estrictos controles de seguridad (Regex Anti-Drop/Update y limite maximo de 200 filas). Solo permite `SELECT` y `WITH`.

## Pruebas Locales

Puede verificar que el enrutamiento y las credenciales funcionen correctamente ejecutando el script de prueba integrado:

```bash
python test_conexion.py
```
