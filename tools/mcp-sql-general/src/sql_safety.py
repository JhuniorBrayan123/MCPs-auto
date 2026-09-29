import re

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
