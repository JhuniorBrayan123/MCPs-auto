# Specification — elk-observability-mcp

This document specifies exact parameters, response shapes, configuration,
and error taxonomy for all 13 v0.1 tools. It is a delta/detail layer on top
of `requirements.md` — every tool below implements one or more numbered
requirements from that document.

## Data source / index configuration

| Env var | Purpose | Default |
|---|---|---|
| `ELASTICSEARCH_URL` | Elastic Cloud endpoint URL | *(none — required)* |
| `ELASTICSEARCH_API_KEY` | API key, sent as `Authorization: ApiKey <value>` | *(none — required)* |
| `APM_TRACE_INDEX` | Index/data-stream holding `transaction` + `span` docs (both `processor.event` values, correlated by `trace.id`) | `traces-apm-default` |
| `APM_ERROR_INDEX` | Index/data-stream holding APM error documents | `logs-apm.error-default` |

Out-of-scope metrics data streams (documented as future extension points
only, not implemented in v0.1): `metrics-apm.internal-default`,
`metrics-apm.service_destination.1m-default`,
`metrics-apm.service_summary.1m-default`,
`metrics-apm.service_transaction.1m-default`,
`metrics-apm.transaction.1m-default`.

### `.env.example` contents

```
# Elasticsearch / Elastic Cloud connection
ELASTICSEARCH_URL=https://your-deployment.es.region.cloud.es.io:443
ELASTICSEARCH_API_KEY=

# Index / data stream names (override only if your deployment differs)
APM_TRACE_INDEX=traces-apm-default
APM_ERROR_INDEX=logs-apm.error-default

# Optional: comma-separated extra field paths to redact in sanitizeDocument()
# beyond the built-in defaults (Authorization, Cookie, Set-Cookie, request/response bodies)
EXTRA_SENSITIVE_FIELDS=

# Optional: enables raw error detail (still never includes API keys/secrets)
DEBUG=false
```

## Common conventions across all tools

- All `period` parameters accept exactly: `15m, 30m, 1h, 2h, 6h, 12h, 24h,
  7d`. Any other value returns `INVALID_PERIOD`.
- All `environment` parameters are free-form strings; omitting them means
  "no environment filter," never a default value.
- All `limit` parameters are capped at 100 server-side regardless of the
  value requested.
- All durations in responses are milliseconds, in fields explicitly suffixed
  `_ms`.
- `include_options` (where present) defaults to `false` and excludes
  `http.request.method: OPTIONS` (case-insensitive) when `false`.

---

## 1. `list_services`

**Requirement:** FR-1, FR-14, FR-17, FR-20

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `environment` | string | no | *(none)* | free-form, no filter if omitted |
| `period` | string | no | `1h` | validated period expression |

**Response:**
```json
{
  "environment": "produccion",
  "period": "1h",
  "services": [
    { "name": "ContabilidadAPI", "transactions": 123456 }
  ]
}
```
`environment` key is present in the response only if it was supplied in the
request (echoing the input, not inferring a default).

---

## 2. `list_endpoints`

**Requirement:** FR-2, FR-14, FR-15, FR-17, FR-20

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `service` | string | yes | — | exact `service.name` |
| `environment` | string | no | *(none)* | |
| `period` | string | no | `1h` | |
| `limit` | number | no | `20` | max `100` |
| `include_options` | boolean | no | `false` | |

**Response:**
```json
{
  "service": "PuntoVentaAPI",
  "endpoints": [
    {
      "transaction": "GET DocumentosContables/GetDocumentoContableVista",
      "method": "GET",
      "sample_path": "/PuntoVenta/api/DocumentosContables/Vista",
      "requests": 118153
    }
  ]
}
```

---

## 3. `get_service_health`

**Requirement:** FR-3, FR-14, FR-15, FR-16, FR-17

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `service` | string | yes | — | |
| `environment` | string | no | *(none)* | |
| `period` | string | no | `1h` | |
| `include_options` | boolean | no | `false` | |

**Response:**
```json
{
  "service": "PuntoVentaAPI",
  "period": "1h",
  "requests": 118153,
  "throughput_rpm": 1968.9,
  "latency": { "avg_ms": 145.2, "p50_ms": 98.0, "p95_ms": 530.0, "p99_ms": 1200.0, "max_ms": 8450.0 },
  "errors": { "count": 214, "rate_percent": 0.18 },
  "status_codes": { "2xx": 117200, "3xx": 320, "4xx": 500, "5xx": 133 }
}
```
No `status`/`health` classification field exists in this shape by design
(FR-3, FR-22).

---

## 4. `get_endpoint_health`

**Requirement:** FR-4, FR-14, FR-15, FR-16, FR-17

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `service` | string | yes | — | |
| `transaction` | string | yes | — | exact `transaction.name` |
| `environment` | string | no | *(none)* | |
| `period` | string | no | `1h` | |
| `include_options` | boolean | no | `false` | |

**Response:** identical shape to `get_service_health`, plus a `transaction`
field:
```json
{
  "service": "PuntoVentaAPI",
  "transaction": "GET DocumentosContables/GetDocumentoContableVista",
  "period": "1h",
  "requests": 118153,
  "throughput_rpm": 1968.9,
  "latency": { "avg_ms": 145.2, "p50_ms": 98.0, "p95_ms": 530.0, "p99_ms": 1200.0, "max_ms": 8450.0 },
  "errors": { "count": 214, "rate_percent": 0.18 },
  "status_codes": { "2xx": 117200, "3xx": 320, "4xx": 500, "5xx": 133 }
}
```

---

## 5. `get_endpoint_latency`

**Requirement:** FR-5, FR-14, FR-16, FR-17

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `service` | string | yes | — | |
| `transaction` | string | yes | — | |
| `environment` | string | no | *(none)* | |
| `period` | string | no | `1h` | |

**Response:**
```json
{
  "service": "PuntoVentaAPI",
  "transaction": "GET DocumentosContables/GetDocumentoContableVista",
  "period": "1h",
  "requests": 118153,
  "avg_ms": 145.2,
  "p50_ms": 98.0,
  "p75_ms": 210.0,
  "p90_ms": 410.0,
  "p95_ms": 530.0,
  "p99_ms": 1200.0,
  "max_ms": 8450.0
}
```

---

## 6. `get_slow_services`

**Requirement:** FR-6, FR-14, FR-15, FR-16, FR-17, FR-20

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `environment` | string | no | *(none)* | |
| `period` | string | no | `1h` | |
| `limit` | number | no | `10` | max `100` |
| `percentile` | number | no | `95` | one of `50, 75, 90, 95, 99` |

**Response:**
```json
{
  "period": "1h",
  "percentile": 95,
  "services": [
    { "service": "FinanzasAPI", "requests": 45210, "avg_ms": 310.0, "p95_ms": 2450.0 }
  ]
}
```
Ordered descending by the field matching the requested percentile.

---

## 7. `get_slow_endpoints`

**Requirement:** FR-7, FR-14, FR-15, FR-16, FR-17, FR-20

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `service` | string | yes | — | |
| `environment` | string | no | *(none)* | |
| `period` | string | no | `1h` | |
| `limit` | number | no | `10` | max `100` |
| `percentile` | number | no | `95` | one of `50, 75, 90, 95, 99` |
| `include_options` | boolean | no | `false` | |

**Response:**
```json
{
  "service": "FinanzasAPI",
  "period": "1h",
  "percentile": 95,
  "endpoints": [
    {
      "transaction": "GET Reporte/GetMontosDeDeudaDelCliente {version}",
      "requests": 12452,
      "avg_ms": 530,
      "p95_ms": 2100,
      "p99_ms": 6400
    }
  ]
}
```

---

## 8. `get_service_errors`

**Requirement:** FR-8, FR-14, FR-17

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `service` | string | yes | — | |
| `environment` | string | no | *(none)* | |
| `period` | string | no | `1h` | |

**Response:**
```json
{
  "service": "PuntoVentaAPI",
  "period": "1h",
  "requests": 118153,
  "http_4xx": 500,
  "http_5xx": 133,
  "event_outcome": { "success": 117800, "failure": 353, "unknown": 0 },
  "apm_errors": 214
}
```
`http_4xx`, `http_5xx`, `event_outcome`, and `apm_errors` are reported as
independent fields — no derived "is this a real failure" judgment is added.

---

## 9. `get_endpoint_errors`

**Requirement:** FR-9, FR-14, FR-17

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `service` | string | yes | — | |
| `transaction` | string | yes | — | |
| `environment` | string | no | *(none)* | |
| `period` | string | no | `1h` | |

**Response:**
```json
{
  "service": "PuntoVentaAPI",
  "transaction": "GET DocumentosContables/GetDocumentoContableVista",
  "period": "1h",
  "requests": 118153,
  "failed_requests": 633,
  "error_rate": 0.54,
  "4xx": 500,
  "5xx": 133,
  "top_errors": [
    { "key": "System.Data.SqlClient.SqlException", "count": 42 }
  ]
}
```

---

## 10. `get_top_errors`

**Requirement:** FR-10, FR-14, FR-17, FR-20

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `service` | string | no | *(none)* | if omitted, aggregate across all services |
| `environment` | string | no | *(none)* | |
| `period` | string | no | `1h` | |
| `limit` | number | no | `10` | max `100` |

**Response:**
```json
{
  "period": "1h",
  "errors": [
    {
      "key": "System.Data.SqlClient.SqlException",
      "count": 42,
      "service": "PuntoVentaAPI",
      "grouping_field_used": "error.grouping_key"
    }
  ]
}
```
`grouping_field_used` reports which candidate field path actually resolved
the grouping for that bucket — a diagnostic aid given the unverified
mapping (Open Risk #1), not a permanent contract field consumers should rely
on for anything beyond transparency.

---

## 11. `trace_request`

**Requirement:** FR-11, FR-16

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `trace_id` | string | yes | — | exact `trace.id` |

**Response:**
```json
{
  "trace_id": "4f5dcb1a1b1bde0fdb9a130a85544498",
  "transaction": {
    "service": "PuntoVentaAPI",
    "name": "GET DocumentosContables/GetDocumentoContableVista",
    "duration_ms": 99.977,
    "status_code": 200
  },
  "spans": [
    {
      "type": "db",
      "subtype": "mssql",
      "name": "SAVE",
      "duration_ms": 0.457,
      "destination": "mssql-puntoventa.sreasons.internal",
      "database": "SRPuntoVenta"
    }
  ]
}
```
Spans are chronologically ordered (by `@timestamp`, then by document order
as a tiebreak). If no document matches `trace_id`, the tool returns a
`TRACE_NOT_FOUND` error (see error taxonomy below), not an empty `spans`
array with a missing transaction.

---

## 12. `get_trace_dependencies`

**Requirement:** FR-12, FR-16

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `trace_id` | string | yes | — | |

**Response:**
```json
{
  "trace_duration_ms": 4800,
  "dependencies": [
    {
      "type": "db",
      "subtype": "mssql",
      "destination": "mssql-puntoventa.sreasons.internal",
      "database": "SRPuntoVenta",
      "calls": 7,
      "total_duration_ms": 3900,
      "percentage_of_trace": 81.25
    }
  ],
  "caveat": "percentage_of_trace is computed as total_duration_ms / trace_duration_ms * 100 and can exceed 100% when spans overlap concurrently; it is not clamped."
}
```
The `caveat` field is always present in this tool's response (not only when
the anomaly occurs) so consumers are never surprised by an unbounded
percentage. `percentage_of_trace` is `number | null` — it is `null` when
`trace_duration_ms` is `0` (e.g. no `transaction` document was found among
the trace's documents, a data anomaly), so the field is never `Infinity` or
`NaN`.

---

## 13. `compare_periods`

**Requirement:** FR-13, FR-14, FR-16, FR-17

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `service` | string | yes | — | |
| `transaction` | string | no | *(none)* | if omitted, compares at service level |
| `environment` | string | no | *(none)* | |
| `current_period` | string | yes | — | validated period expression |
| `comparison_period` | string | yes | — | validated period expression |

**Response:**
```json
{
  "service": "PuntoVentaAPI",
  "current_period": "1h",
  "comparison_period": "24h",
  "metrics": {
    "requests":       { "current": 118153, "comparison": 2750000, "diff_absolute": -2631847, "diff_percent": -95.7 },
    "throughput_rpm": { "current": 1968.9, "comparison": 1909.7, "diff_absolute": 59.2, "diff_percent": 3.1 },
    "avg_ms":         { "current": 145.2, "comparison": 150.8, "diff_absolute": -5.6, "diff_percent": -3.7 },
    "p95_ms":         { "current": 530.0, "comparison": 560.0, "diff_absolute": -30.0, "diff_percent": -5.4 },
    "p99_ms":         { "current": 1200.0, "comparison": 1350.0, "diff_absolute": -150.0, "diff_percent": -11.1 },
    "error_rate":     { "current": 0.18, "comparison": 0.22, "diff_absolute": -0.04, "diff_percent": -18.2 }
  }
}
```
`diff_absolute = current - comparison`; `diff_percent = diff_absolute /
comparison * 100` (reported as `null` if `comparison` is `0`, to avoid
division-by-zero misrepresentation).

---

## Error taxonomy

| Code | Meaning | Example trigger |
|---|---|---|
| `AUTHENTICATION_ERROR` | Elasticsearch rejected the API key (401) | Expired or malformed `ELASTICSEARCH_API_KEY` |
| `AUTHORIZATION_ERROR` | API key valid but lacks privileges (403) | API key without read access to `APM_TRACE_INDEX` |
| `INDEX_NOT_FOUND` | Target index/data-stream does not exist (404) | `APM_ERROR_INDEX` misconfigured to a non-existent name |
| `SERVICE_NOT_FOUND` | No documents match the given `service` within the period/environment filter | `service: "Typo123"` with no matching `service.name` |
| `TRANSACTION_NOT_FOUND` | No documents match the given `service` + `transaction` combination | Valid service, non-existent `transaction.name` |
| `TRACE_NOT_FOUND` | No documents match the given `trace_id` | Expired/incorrect `trace_id` passed to `trace_request` |
| `INVALID_PERIOD` | `period`/`current_period`/`comparison_period` fails strict validation | `period: "1 hour"` or `period: "1h; DROP"` |
| `ELASTICSEARCH_TIMEOUT` | Underlying ES request exceeded the client timeout | Large aggregation over `7d` period times out |
| `ELASTICSEARCH_ERROR` | Any other Elasticsearch client/server error not covered above | Malformed query DSL, cluster unavailable, 5xx from ES |

All error responses share one envelope shape:
```json
{ "error": { "code": "SERVICE_NOT_FOUND", "message": "No service named 'Typo123' found in the given period." } }
```
Raw stack traces are included only when `DEBUG=true`, under an additional
`error.debug_detail` field — never by default, and never containing the API
key or Authorization header value under any configuration.
