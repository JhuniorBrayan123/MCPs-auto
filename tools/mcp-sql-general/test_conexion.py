import server
import json

def probar():
    try:
        print("Intentando conectar a la base de datos 'msdb' de forma dinámica usando el .env...")
        base_datos_prueba = "msdb"
        
        conn = server.obtener_conexion_dinamica(base_datos_prueba, servidor="PuntoVenta")
        print("[OK] ¡Conexión exitosa a la base de datos!")
        
        print("\nProbando consulta de Stored Procedures...")
        cursor = conn.cursor()
        cursor.execute("SELECT TOP 10 name FROM sys.objects WHERE type = 'P' ORDER BY name")
        sps = cursor.fetchall()
        
        if sps:
            print(f"[OK] La base de datos respondió correctamente. Aquí tienes los primeros {len(sps)} SPs encontrados:")
            for sp in sps:
                print(f" - {sp[0]}")
        else:
            print("[OK] La conexión funciona, pero no se encontraron Stored Procedures en esta base de datos.")
            
        conn.close()
        
        print("\n--- PRUEBA DE LA HERRAMIENTA MCP (AUDITORÍA) ---")
        if sps:
            primer_sp = sps[0][0]
            print(f"Intentando obtener el código fuente de: '{primer_sp}' en {base_datos_prueba}...")
            
            # Simulamos lo que haría la IA llamando a la herramienta, pasando ahora base_datos
            resultado_sp = server.obtener_definicion_sp(base_datos_prueba, primer_sp)
            
            if resultado_sp["status"] == "success":
                codigo_sp = resultado_sp["definition"]
                print(f"[OK] ¡Código obtenido exitosamente! ({len(codigo_sp)} caracteres en total)")
                print("========================================")
                # Mostrar solo los primeros 300 caracteres para no llenar la pantalla
                print(codigo_sp[:300] + "\n\n... [El resto del código fue ocultado en esta prueba] ...")
                print("========================================")
            else:
                print(f"[ERROR] {resultado_sp['message']}")

        print("\n--- PRUEBA 2: CONSULTA SEGURA (NUEVA HERRAMIENTA) ---")
        query_valida = "SELECT TOP 5 name, object_id FROM sys.tables"
        print(f"Enviando consulta: '{query_valida}'...")
        resultado_seguro = server.ejecutar_consulta_segura(base_datos_prueba, query_valida)
        if resultado_seguro["status"] == "success":
            print(f"[OK] Consulta exitosa. Filas obtenidas: {resultado_seguro['count']}")
            print(json.dumps(resultado_seguro["rows"], indent=2))
        else:
            print(f"[ERROR INESPERADO] {resultado_seguro['message']}")

        print("\n--- PRUEBA 3: ATAQUE DE INYECCIÓN (NUEVA HERRAMIENTA) ---")
        query_invalida = "DROP TABLE Usuarios; -- intento de ataque"
        print(f"Enviando ataque destructivo: '{query_invalida}'...")
        resultado_ataque = server.ejecutar_consulta_segura(base_datos_prueba, query_invalida)
        if resultado_ataque["status"] == "error":
            print(f"[OK BLOQUEADO] El muro de seguridad funcionó: {resultado_ataque['message']}")
        else:
            print(f"[PELIGRO] El ataque pasó las defensas.")

        # --- PRUEBA 4: RESOLUCIÓN DE BASE DE DATOS DUPLICADA ---
        print("\n--- PRUEBA 4: RESOLUCIÓN DE BASE DE DATOS DUPLICADA ---")
        base_duplicada = "SRAgentes"
        servidor_elegido = "PV"
        print(f"Intentando listar Stored Procedures de '{base_duplicada}' en el servidor '{servidor_elegido}'...")
        try:
            res_dup = server.listar_stored_procedures(base_duplicada, servidor_elegido)
            if res_dup.get("status") == "success":
                print(f"[OK] Se resolvió correctamente el mapeo de {base_duplicada} hacia {servidor_elegido}.")
            else:
                print(f"[FALLÓ] No se pudo conectar usando el parámetro servidor: {res_dup.get('message')}")
        except Exception as e:
            # En caso de que la BD no exista fisicamente en la IP configurada durante esta prueba de test local
            print(f"[INFO] Excepción controlada (probablemente credenciales locales inválidas o no hay red): {e}")

        print("\nTodo está listo")
        
    except Exception as e:
        print(f"\n[ERROR] Hubo un error al intentar conectar:")
        print(f"{type(e).__name__}: {str(e)}")
        print("\nRevisa que los datos en tu archivo .env sean correctos y que el servidor SQL esté encendido.")

if __name__ == "__main__":
    probar()
