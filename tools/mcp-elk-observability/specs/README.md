# SDD Artifact Layout — specs/

This project uses the **hybrid** SDD persistence mode: durable file artifacts under
`specs/` (this directory) in parallel with Engram persistent-memory observations
(topic keys prefixed `sdd/{change-name}/...`). Both are written by each SDD phase;
neither is the sole source of truth — treat them as mirrors of the same content.

## Layout

Each SDD change gets its own folder, created by `sdd-propose` (or the first phase
that produces an artifact for that change):

```
specs/
└── {change-name}/
    ├── requirements.md   <- from sdd-explore / sdd-propose: problem, scope, constraints
    ├── specification.md  <- from sdd-spec: delta requirements (Given/When/Then scenarios, RFC 2119 keywords)
    ├── design.md          <- from sdd-design: technical design, architecture decisions, sequence diagrams
    ├── tasks.md            <- from sdd-tasks: hierarchical task breakdown, updated by sdd-apply as tasks complete
    └── verification.md    <- from sdd-verify: verification report (tests, coverage, build status)
```

No `{change-name}` folder exists yet — this file only establishes the convention.
The first real change (e.g. via `sdd-explore` or `sdd-new`) will create its own
folder under `specs/` following this exact five-file naming.

## Rules

- If a file already exists for a change, READ it first and UPDATE it — never overwrite blindly.
- If a change folder already exists with artifacts, that change is being CONTINUED, not started fresh.
- Each file's corresponding Engram observation uses topic key `sdd/{change-name}/{artifact-type}`
  (`requirements`, `spec`, `design`, `tasks`, `verify-report` — see `sdd-init/mcp-elk-observability`
  project context in Engram for the exact mapping).
- Completed changes are not deleted; a future `sdd-archive` phase will define the archive convention
  for this project (not yet needed — no change has been completed).

## Why `specs/` instead of `openspec/`

This project explicitly opted into a `specs/`-rooted hybrid layout (chosen at SDD
init time) rather than the default `openspec/` directory tree used by some SDD
skills. Phases operating on this project must read/write under `specs/` using the
five-file names above, not `openspec/changes/.../proposal.md` etc.
