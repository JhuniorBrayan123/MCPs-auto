# mcp-elk-observability

A read-only [MCP](https://modelcontextprotocol.io) server that gives AI
coding/ops agents (Claude Code, Claude Desktop, or any other MCP client)
structured, deterministic access to Elastic APM/Elasticsearch observability
data for microservices — traces, transactions, spans, and errors.

It is deliberately **not** a health-classification or diagnosis tool: it
never decides "healthy / degraded / critical." It fetches, normalizes, and
shapes raw Elasticsearch data into small structured responses; the calling
agent (or human) does the reasoning.

## Contents

- [Architecture](#architecture)
- [Configuration](#configuration)
- [Installation](#installation)
- [Running locally](#running-locally)
- [MCP client configuration (Claude Code / Claude Desktop)](#mcp-client-configuration-claude-code--claude-desktop)
- [Tools reference](#tools-reference)
- [Security](#security)
- [Docker usage](#docker-usage)
- [Troubleshooting](#troubleshooting)
- [Open risks / assumptions](#open-risks--assumptions)

## Architecture

The server is layered so that each layer only depends on the one below it —
dependencies never point upward, and `domain/` never imports from `tools/`,
`server/`, or `transport/`. This keeps business logic transport-agnostic and
unit-testable against an injected fake client, and means a future HTTP/SSE
transport could be added without touching tool or domain code.

```
transport/   stdio.ts today (http.ts/sse.ts could be added later)
     |
     v
server/      MCP server bootstrap + tool registration (transport-agnostic)
     |
     v
tools/       one file per MCP tool: Zod input validation -> domain call ->
             response shaping/sanitization
     |
     v
domain/      services / endpoints / health / errors / traces / compare —
             Elasticsearch-facing business logic, testable via an injected
             fake search client
     |
     v
elastic/     client, filters, query-builder (QuerySpec compiler),
             aggregations, period-parser, search wrapper with error mapping
```

`schemas/` (Zod schemas per tool), `utils/` (sanitization, time-unit
conversion, typed error taxonomy), and `config/` (env loading/validation)
support the above layers across the stack. See
[`specs/elk-observability-mcp/design.md`](specs/elk-observability-mcp/design.md)
for the full architecture decision record.

**Read-only guarantee:** the Elasticsearch client is used exclusively for
`search`/read APIs. No tool, and no code path reachable from any tool, ever
issues a write, update, delete, mapping-change, ILM, or cluster-settings
request. This server cannot mutate your Elasticsearch cluster.

**No AI/LLM logic inside the server:** it contains no LLM calls, prompts, or
model inference, and does not classify, score, or judge data beyond
deterministic arithmetic/aggregation (e.g. it never labels something
"anomalous" — that's the calling agent's job).

## Configuration

All configuration is supplied via environment variables, validated once at
startup (`config/env.ts`). Copy [`.env.example`](.env.example) to `.env` for
local development (`.env` is git-ignored and never baked into the Docker
image).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ELASTICSEARCH_URL` | **Yes** | *(none)* | Elastic Cloud (or self-managed) endpoint URL, e.g. `https://your-deployment.es.region.cloud.es.io:443`. |
| `ELASTICSEARCH_API_KEY` | **Yes** | *(none)* | API key credential. Sent as the `Authorization: ApiKey <value>` header. Never logged, never returned in any response, including debug output. |
| `APM_TRACE_INDEX` | No | `traces-apm-default` | Index/data-stream holding `transaction` and `span` documents (both `processor.event` values, correlated by `trace.id`). |
| `APM_ERROR_INDEX` | No | `logs-apm.error-default` | Index/data-stream holding APM error documents. |
| `EXTRA_SENSITIVE_FIELDS` | No | *(none — empty list)* | Comma-separated extra field paths to redact in `sanitizeDocument()`, on top of the built-in defaults (`Authorization`, `Cookie`, `Set-Cookie`, request/response bodies). |
| `DEBUG` | No | `false` | Set to exactly `true` to include a `debug_detail` field with extra error context on error responses. Never includes the API key or `Authorization` header value under any configuration. |

Startup fails fast with a typed error listing every missing required
variable if `ELASTICSEARCH_URL` and/or `ELASTICSEARCH_API_KEY` are absent —
it never falls back to placeholder credentials.

## Installation

Requires Node.js `>=20.9.0` (see `engines` in `package.json`).

```bash
npm install
npm run build
```

`npm run build` runs `tsc -p tsconfig.json`, compiling `src/**/*.ts`
(excluding `*.test.ts`) into `dist/` (see `tsconfig.json`'s `rootDir`/`outDir`).
The executable entrypoint is `dist/main.js` (`package.json`'s `main` field,
built from `src/main.ts`).

## Running locally

```bash
# after `npm run build`, with ELASTICSEARCH_URL / ELASTICSEARCH_API_KEY set
node dist/main.js
```

There is no `npm start` script defined in `package.json` — run the compiled
entrypoint directly with `node dist/main.js`, or point your MCP client
straight at it (see below).

Test scripts (`package.json`):

```bash
npm test              # vitest run — single run, all 286 tests
npm run test:watch    # vitest — watch mode
npm run test:coverage # vitest run --coverage
```

Type-check without emitting: `npx tsc --noEmit`.

## Streamable-http transport (trusted-issuer + AVP)

By default (`MCP_TRANSPORT=stdio`, or unset) this server behaves exactly as
described above: local process, stdin/stdout, no network, no auth. Setting
`MCP_TRANSPORT=streamable-http` switches to an Express server exposing
`POST` on whatever path `MCP_PUBLIC_URL` says (bound on `MCP_HOST`/`MCP_PORT`)
— in this deployment, `https://mcp.gutierrezautomotriz.com/elk-observability/mcp`,
behind the same shared ALB that already fronts
[`../../../mcp-oauth-proxy`](../../../mcp-oauth-proxy) at the domain root,
routing `/elk-observability/*` to this process's local port (see
[`../../deploy/PORTS.md`](../../deploy/PORTS.md)). The path is taken
verbatim from `MCP_PUBLIC_URL` (`src/transport/http.ts`), so that value
must match the ALB rule exactly.

### Instalación

`mcp-cognito-avp` lives only in `erp2-npm` (private). This repo's `.npmrc`
points the *default* registry straight at `erp2-npm`:

```
registry=https://smartreasons-983698321034.d.codeartifact.us-west-2.amazonaws.com/npm/erp2-npm/
```

`erp2-npm` has an upstream configured to resolve public packages too, so a
plain `npm install`/`npm ci` resolves everything (private and public)
through this single registry — no scopes, no tarball URLs, no two-step
install. The only requirement is a valid CodeArtifact npm login before
installing (lasts 12h):

```powershell
aws codeartifact login --tool npm --domain smartreasons --domain-owner 983698321034 --repository erp2-npm --region us-west-2
npm install
```

## MCP client configuration (Claude Code / Claude Desktop)

This server uses the stdio transport exclusively in v0.1 — no HTTP port, no
health-check endpoint. Register it like any other standalone stdio MCP
server, pointing `command`/`args` at the built `dist/main.js` and passing
connection details via `env`. Use an absolute path to `dist/main.js`.

**Claude Code** (`.mcp.json` in the project root, or via
`claude mcp add-json`):

```json
{
  "mcpServers": {
    "elk-observability": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-elk-observability/dist/main.js"],
      "env": {
        "ELASTICSEARCH_URL": "https://your-deployment.es.region.cloud.es.io:443",
        "ELASTICSEARCH_API_KEY": "your-api-key-here",
        "APM_TRACE_INDEX": "traces-apm-default",
        "APM_ERROR_INDEX": "logs-apm.error-default"
      }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`) — identical shape, under
the same `mcpServers` key:

```json
{
  "mcpServers": {
    "elk-observability": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-elk-observability/dist/main.js"],
      "env": {
        "ELASTICSEARCH_URL": "https://your-deployment.es.region.cloud.es.io:443",
        "ELASTICSEARCH_API_KEY": "your-api-key-here",
        "APM_TRACE_INDEX": "traces-apm-default",
        "APM_ERROR_INDEX": "logs-apm.error-default"
      }
    }
  }
}
```

Each MCP server the client uses is registered independently with its own
`command`/`args`/`env` block — this server has no dependency on, and no
shared configuration with, any other MCP server you may have registered.

Windows paths in `args` should use forward slashes or escaped backslashes in
JSON (e.g. `"C:/Users/you/mcp-elk-observability/dist/main.js"`).

## Tools reference

All 13 tools are registered in `src/server/index.ts` in the order below. All
`period` parameters accept exactly `15m, 30m, 1h, 2h, 6h, 12h, 24h, 7d`
(default `1h` where applicable); all `limit` parameters are capped at `100`
server-side; all durations in responses are milliseconds in `_ms`-suffixed
fields; `environment` is always free-form and omitting it means "no
filter," never a default. Full parameter tables and example
request/response payloads for every tool are in
[`specs/elk-observability-mcp/specification.md`](specs/elk-observability-mcp/specification.md).
Short summary:

| # | Tool | Params | One-line description |
|---|---|---|---|
| 1 | `list_services` | `environment?`, `period?` | Discovers `service.name` values via aggregation, sorted by transaction volume descending. |
| 2 | `list_endpoints` | `service`, `environment?`, `period?`, `limit?`, `include_options?` | Lists transactions (endpoints) for a service, grouped by `transaction.name`. |
| 3 | `get_service_health` | `service`, `environment?`, `period?`, `include_options?` | Requests, throughput, latency percentiles, error count/rate, status-code breakdown for a service — no health classification. |
| 4 | `get_endpoint_health` | `service`, `transaction`, `environment?`, `period?`, `include_options?` | Same shape as `get_service_health`, scoped to one endpoint. |
| 5 | `get_endpoint_latency` | `service`, `transaction`, `environment?`, `period?` | Full latency percentile breakdown (`p50`–`p99`, `avg`, `max`) for one endpoint. |
| 6 | `get_slow_services` | `environment?`, `period?`, `limit?`, `percentile?` | Ranks services by a selected latency percentile, descending. |
| 7 | `get_slow_endpoints` | `service`, `environment?`, `period?`, `limit?`, `percentile?`, `include_options?` | Ranks a service's endpoints by a selected latency percentile. |
| 8 | `get_service_errors` | `service`, `environment?`, `period?` | HTTP 4xx/5xx counts, `event.outcome` breakdown, APM error count — as independent fields, no derived judgment. |
| 9 | `get_endpoint_errors` | `service`, `transaction`, `environment?`, `period?` | Failed-request count/rate, 4xx/5xx split, and top error keys for one endpoint. |
| 10 | `get_top_errors` | `service?`, `environment?`, `period?`, `limit?` | Top APM error groups, using a tolerant candidate-field cascade (see Open Risks). |
| 11 | `trace_request` | `trace_id` | Reconstructs one trace: the transaction plus all its spans, chronologically ordered. |
| 12 | `get_trace_dependencies` | `trace_id` | Groups a trace's spans by `(type, subtype, destination)` with call counts, durations, and percentage-of-trace. |
| 13 | `compare_periods` | `service`, `transaction?`, `environment?`, `current_period`, `comparison_period` | Compares requests/throughput/latency/error-rate between two periods (absolute + percent diff). |

### Error responses

Every error response shares one envelope:

```json
{ "error": { "code": "SERVICE_NOT_FOUND", "message": "No service named 'Typo123' found in the given period." } }
```

Typed codes: `AUTHENTICATION_ERROR`, `AUTHORIZATION_ERROR`,
`INDEX_NOT_FOUND`, `SERVICE_NOT_FOUND`, `TRANSACTION_NOT_FOUND`,
`TRACE_NOT_FOUND`, `INVALID_PERIOD`, `ELASTICSEARCH_TIMEOUT`,
`ELASTICSEARCH_ERROR`. Raw stack traces are never included unless
`DEBUG=true`, and even then only under `error.debug_detail` — never
containing the API key.

## Security

- **Read-only by construction** — the Elasticsearch client is only ever
  used for `search`; no write/update/delete/mapping/ILM/cluster-settings
  call exists anywhere in the codebase (FR-18).
- **Sanitized by default** — every document field returned to a caller
  passes through `utils/sanitize.ts`'s `sanitizeDocument()` first, which
  strips `Authorization`, `Cookie`, and `Set-Cookie` headers plus request
  and response bodies/query strings by default, before any tool-specific
  shaping happens. Add more field paths via `EXTRA_SENSITIVE_FIELDS`.
- **No secrets in logs or errors** — `ELASTICSEARCH_API_KEY` is never
  logged and never appears in any response, including `error.debug_detail`
  under `DEBUG=true`.
- **Typed error taxonomy, no raw stack traces** — every failure is mapped
  to exactly one of nine typed codes (FR-21); raw stack traces are only
  ever attached when `DEBUG=true` was explicitly set.
- **Injection-hardened period parsing** — `period`/`current_period`/
  `comparison_period` are validated against an exact allow-list of eight
  values before they can reach the Elasticsearch range filter, rejecting
  anything else (including `"1h; DROP"`-style input) with `INVALID_PERIOD`.
- **Response bounding** — every list-shaped response enforces `limit <=
  100` server-side regardless of what a caller requests.

## Docker usage

The [`Dockerfile`](Dockerfile) is a two-stage build: stage 1 (`builder`)
installs full dependencies and compiles TypeScript; stage 2 (`runtime`)
installs only production dependencies, copies in the compiled `dist/`
output, and runs as the non-root `node` user (uid 1000). No credentials are
baked into the image — everything is supplied at `docker run` time.

Build:

```bash
docker build -t mcp-elk-observability .
```

Run (env vars from a file — recommended, keeps secrets out of shell
history/process list):

```bash
docker run --rm -i --env-file .env mcp-elk-observability
```

Run (inline flags):

```bash
docker run --rm -i \
  -e ELASTICSEARCH_URL="https://your-deployment.es.region.cloud.es.io:443" \
  -e ELASTICSEARCH_API_KEY="your-api-key" \
  mcp-elk-observability
```

`-i` (interactive, keep stdin open) is required because this is a stdio MCP
server — an MCP client talks to it over stdin/stdout. There is no `EXPOSE`d
port and no `-p` mapping to add. To register the containerized server with
an MCP client instead of a local `node dist/main.js` process, point
`command` at `docker` and `args` at the equivalent `run` invocation.

## Troubleshooting

**`AUTHENTICATION_ERROR`** — Elasticsearch rejected the API key (HTTP 401).
Check that `ELASTICSEARCH_API_KEY` is set, current, and not truncated/copied
with extra whitespace.

**`AUTHORIZATION_ERROR`** — the API key is valid but lacks read privileges
on the target index (HTTP 403). Confirm the key has read access to both
`APM_TRACE_INDEX` and `APM_ERROR_INDEX`.

**`INDEX_NOT_FOUND`** — the configured index/data-stream does not exist
(HTTP 404). Double-check `APM_TRACE_INDEX` / `APM_ERROR_INDEX` spelling
against your cluster (defaults are `traces-apm-default` /
`logs-apm.error-default`); a typo'd env var is the most common cause.

**`INVALID_PERIOD`** — a `period` (or `current_period`/`comparison_period`)
value isn't exactly one of `15m, 30m, 1h, 2h, 6h, 12h, 24h, 7d`. Values like
`"1 hour"`, `"1d"`, or empty strings are rejected by design (this validation
is also what prevents range-filter injection).

**Connecting to Elastic Cloud** — `ELASTICSEARCH_URL` should be the full
HTTPS endpoint including port, e.g.
`https://your-deployment.es.region.cloud.es.io:443`. Do not include a path
suffix or trailing index name in the URL — indices are configured
separately via `APM_TRACE_INDEX`/`APM_ERROR_INDEX`.

**How do I confirm the server actually started?** stdio transport has no
HTTP health-check endpoint by design — stdout is reserved exclusively for
the MCP JSON-RPC message stream (writing anything else there would corrupt
it), so there is no "listening on port ..." banner to watch for. Ways to
confirm a successful start:

1. **Missing/bad config fails immediately and visibly.** Run
   `node dist/main.js` (or the Docker equivalent) directly in a terminal
   with required env vars unset — it should print
   `Fatal error starting mcp-elk-observability: Missing required
   environment variable(s): ...` to **stderr** and exit with code `1`. If
   env vars are present and it does *not* print that line and does *not*
   exit, startup succeeded and the process is now blocked reading stdin,
   which is the expected steady state.
2. **Use a real MCP client.** Register it (see above) with Claude Code or
   Claude Desktop and confirm the 13 tools (`list_services`,
   `list_endpoints`, etc.) appear in the client's tool list — the client
   handles the JSON-RPC handshake for you.
3. **Manual JSON-RPC smoke test.** Pipe a single `initialize` request in
   and look for a JSON-RPC response on stdout:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.1"}}}' | node dist/main.js
   ```
   A JSON object containing `"result"` with server capabilities on stdout
   means the server started and answered correctly.

## Open risks / assumptions

These are carried over from
[`specs/elk-observability-mcp/requirements.md`](specs/elk-observability-mcp/requirements.md)'s
"Open Risks / Assumptions" section — verify each one once real
`ELASTICSEARCH_URL`/`ELASTICSEARCH_API_KEY` credentials exist, before
treating the corresponding behavior as fully confirmed:

1. **`APM_ERROR_INDEX` field names are unverified** against real mappings.
   `get_top_errors` assumes `error.grouping_key` as primary, falling back to
   `error.exception.type`, via a tolerant candidate-path cascade — confirm
   against a real `_mapping` inspection.
2. **No live Elasticsearch cluster was available during development.** All
   Query DSL shapes are best-effort derived from Elastic APM conventions and
   sample documents, not confirmed against a real ES 8.19.20 cluster.
3. **Percentiles are TDigest approximations, not exact values** — this is
   an inherent property of Elasticsearch's `percentiles` aggregation, not a
   defect.
4. **The sample span document lacks `parent.id`/`span.id`.** Deep nested
   call-tree reconstruction beyond transaction/span-group level is
   unverified as possible and is not implemented.
5. **`percentage_of_trace` can exceed 100%** when spans overlap
   concurrently — this is shipped as a documented, never-clamped caveat, not
   a bug.
6. **`http.request.method` casing for `OPTIONS`** is assumed uppercase per
   HTTP convention but unverified against real documents; matching is
   case-insensitive to hedge this.
7. **Implementation sequencing:** 13 tools plus a shared elastic/domain
   layer were implemented as multiple reviewable slices rather than one
   change — see `tasks.md` for the grouping.

If you get real cluster access, the highest-value first step is a
`_mapping` inspection of `APM_ERROR_INDEX` to resolve risk #1 (see
`specs/elk-observability-mcp/tasks.md` section 9, "Integration tests").
