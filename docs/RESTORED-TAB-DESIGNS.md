# Restored tab designs on the local runtime

The original per-tab layouts are used again, instead of routing unrelated
sections into one generic workspace. Original source and reference screenshots
remain intact. The local views reuse their page styles and structural classes:

| Section | Restored composition |
| --- | --- |
| Overview | Welcome banner, four metrics, pipeline, capture panel, runtime topology, shortcuts and history |
| AI Agent Studio | Composer and execution tree with intelligence, scope and safeguards sidebar |
| Live Execution | Perception/event stream, central capture/approval panel and right execution inspector |
| Visual Observations | Viewer, telemetry/target inspector and recent-context gallery |
| Task Manager | Filter tabs, ledger and focused task inspector |
| Computers & Applications | Paired-device table, workspace/permissions inspector and searchable real application catalog |
| Recovery Center | Protocol header, four metrics, baseline/pipeline/fresh-evidence comparison and audit panels |
| Verification Lab | Three evidence metrics, four stages, criteria/evidence comparison and audit ledger |
| Analytics & Benchmarks | Source header, four metrics, chart, source inspector and results table |
| AI Models | Runtime metrics, model/grounding cards, supporting services and environment sidebar |
| Activity Logs | Five metrics, filters, record feed and metadata inspector |
| Settings | Module navigation, access/calibration sidebar and configuration/application/service cards |
| Mission Control | Lifecycle hero, mission metrics, task composer, reviewed plan and guided workflow |

Local data is supplied by the paired-agent ledger and application catalog.
The former hardware inventory tab is now Computers & Applications. Its catalog
follows the selected device and supports explicit permission changes and reviewed
launch drafts; detection alone grants no permission. The `/inventory` URL remains
compatible with existing links. No inventory demo services are used by this page.

Task preparation, exact approval, cancellation, fresh recovery drafts and exports keep
using the local protocol. Completion, agent file readback and application launch
requests stay distinct. Missing desktop captures, visual reasoning, performance
measurements or independent visual verdicts are shown as unavailable rather than
filled with historical demo evidence. English/Spanish preference is preserved.

`.env` and `.env.example` share six settings grouped into local execution,
access/database and optional Meta configuration. Technical limits use backend
defaults; legacy worker settings are omitted. Model calls remain disabled.
Existing credentials were preserved; removed legacy settings have a private,
ignored backup in `.local/env-before-cleanup.backup`.

Visual references: `docs/screenshots/{overview,studio,execution,tasks,...}`.
Current screenshots: [restored local designs](screenshots/restored-local-designs).
Automated browser evidence: [layout checks](evidence/restored-local-designs.json).
The checks visit all original compositions, exercise both languages, inspect
desktop widths and ensure inspection sends no task mutations or demo requests.

Validation completed: frontend typecheck and lint passed, all 161 tests across
24 files passed, and browser checks passed against the deployed local frontend
at port 5173. Backend, frontend and PostgreSQL health checks passed.
