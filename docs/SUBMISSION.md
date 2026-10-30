# INTI AI — Hackathon Submission

**Meta Global AI Developer Hackathon 2026 · Push the Frontier · Indie Developer track**

**INTI AI — Intelligent Navigation, Task Execution & Interaction**

> See. Reason. Act. Verify.

## One-line pitch

INTI AI is a visual agent that turns an objective into an approved browser
mission, verifies the persisted outcome independently, and reports exactly what it
could and could not prove.

## The problem

Conventional automation assumes the interface will not change. When a button moves,
is renamed, or the UI reports success without persisting it, the automation either
breaks silently or reports a false success. INTI AI treats execution, recovery and
verification as separate, inspectable decisions.

## What the demo proves

The `INTI-DEMO-001` scenario:

1. Resets the marked synthetic inventory store so `PC-104` is `Inactive`.
2. Creates a mission with a stable task ID.
3. Prepares a nine-step authored recipe (explicitly labeled as authored, not
   Meta-generated planning).
4. Requires exact-manifest approval plus a separate HIGH-risk approval for the
   save action.
5. Executes the steps in real Chromium against the synthetic application.
6. Detects failures and supports bounded recovery. The live rename/relocate fault
   requires real Meta access and is gated in this environment.
7. Runs an independent verifier against fresh persisted state.
8. Shows the verdict, criteria, evidence IDs and integrity checks.
9. Presents measured benchmark evidence with explicit unavailable metrics.

The latest real run is recorded in
[`docs/evidence/phase7-live-demo.json`](evidence/phase7-live-demo.json):

- backend `0.7.0`; execution, verification and demo controls enabled;
- Meta model calls disabled;
- reset established `PC-104 = Inactive`;
- 9 authored actions executed by the real browser worker;
- execution `COMPLETED`;
- independent verdict `VERIFIED_SUCCESS`;
- 8 evidence items, all integrity checks intact;
- persisted `PC-104 = Operational`;
- a Meta mission failed explicitly with `MODEL_CALLS_DISABLED` (no fallback plan);
- no recovery was triggered on the authored happy path.

## What is real, what is authored, what is blocked

| Area | Status | Evidence |
|---|---|---|
| Task input, mission identity, guided tracker | Implemented and verified | Live demo JSON, Mission Control screenshot |
| Authored plan and real browser execution | Implemented and verified | 9 real action results in live demo JSON |
| Exact-manifest and HIGH-action approval | Implemented and verified | Approval section in live demo JSON |
| Independent verification and evidence integrity | Implemented and verified | Verdict, criteria, 8/8 intact evidence items |
| Synthetic reset isolation | Implemented and verified | Reset response; `DEMO_BUSY` guard tested |
| Live Meta planning | Blocked in this environment | `MODEL_CALLS_DISABLED`; no key configured |
| Live rename/relocate recovery | Blocked in this environment | Requires enabled Meta calls + key |
| Recovery mechanics | Implemented but not live-verified | Fixture-based integration test with real fault, browser and verifier |
| Comparative evaluation | Not implemented | Benchmark Lab states it explicitly |
| Recovery success / execution latency / unsafe actions | Unavailable | No measurement exists; UI does not invent one |

## Measured verification benchmark

From [`benchmarks/reports/phase-05-verification.json`](../benchmarks/reports/phase-05-verification.json):

| Metric | Result |
|---|---|
| Scenarios | 5 deterministic fault trials |
| Expected verdict agreement | 5 / 5 |
| Verified task success | 1 / 5 |
| False-positive detection | 3 / 3 |
| Inconclusive | 1 / 5 |
| Criteria evaluation accuracy | 25 / 25 |
| Evidence collection failures | 3 |
| Evidence integrity failures | 0 |
| Observed verifier mutations | 0 |
| Mean verification latency | ~3290 ms |
| Model calls | 0 |

This measures the verifier against a deliberately chosen fault mix. It is not a
model-quality, recovery-quality or comparative-agent benchmark.

## Why it fits the track

- **Multimodal/visual:** real Chromium observations and screenshots drive actions.
- **Agentic execution:** a typed, bounded plan with explicit authorization.
- **Frontier behavior:** the product separates “the UI said it worked” from “the
  system proved it worked,” and refuses to fake a recovery it cannot perform.
- **Local-first, reproducible:** one Docker Compose stack, committed evidence,
  deterministic reset, and a real smoke test.

## Run it

Requirements: Docker Desktop with Linux containers, Python 3.12+, Node 22+.

```powershell
Copy-Item .env.example .env
# Generate distinct capabilities in .env (at least 24 chars each):
# EXECUTION_OPERATOR_TOKEN, BROWSER_WORKER_TOKEN, VERIFICATION_READ_TOKEN,
# DEMO_FAULT_CONTROL_TOKEN
powershell -ExecutionPolicy Bypass -File .\scripts\start_demo.ps1
```

On a network with TLS interception, pass the trusted CA explicitly:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_demo.ps1 -BuildCaPem .\.tmp\build-ca.pem
```

Open <http://localhost:5173>, connect with `EXECUTION_OPERATOR_TOKEN`, then use
**Guided demo** in the top bar. The token stays in browser memory for the session.

Verify the demo without a model call:

```powershell
.\.venv\Scripts\python.exe scripts\live_demo_check.py
```

Capture genuine screenshots from the running app:

```powershell
.\.venv\Scripts\python.exe scripts\capture_demo_screenshots.py
```

## Screenshots

All images were captured from the running local stack with
`scripts/capture_demo_screenshots.py`:

- [`phase7-mission-control.png`](screenshots/phase7-mission-control.png)
- [`phase7-active-mission.png`](screenshots/phase7-active-mission.png)
- [`phase7-benchmark-lab.png`](screenshots/phase7-benchmark-lab.png)
- [`phase7-verification.png`](screenshots/phase7-verification.png)
- [`phase7-recovery-center.png`](screenshots/phase7-recovery-center.png)

## Documentation

- [Final architecture](FINAL-ARCHITECTURE.md)
- [Judge demo guide](JUDGE-DEMO-GUIDE.md)
- [Demo video script](DEMO-VIDEO-SCRIPT.md)
- [Demo storyboard](DEMO-STORYBOARD.md)
- [QA checklist](QA-CHECKLIST.md)
- [Phase 7 report](PHASE-07-REPORT.md)

## Submission status

- Repository: <https://github.com/AlanHerrera01/INTI-IA-META-HACKATHON>
- Demo video: **not recorded / no URL claimed**
- Hackathon form: **not submitted from this environment**
- Eligibility/full current rules: **unconfirmed; organizer overview checked below**

No submission, public video, or organizer confirmation is claimed unless it is
confirmed separately by the account owner. The local build and evidence do not
prove acceptance into the hackathon.

## License and provenance

Original project source is MIT licensed. Third-party packages retain their licenses.
No proprietary application source or assets were copied.

## Authoritative requirement check - 2026-10-30

The [organizer event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
was accessed on 2026-10-30. It lists the submission deadline as November 4,
9:00 PM ET and identifies the Indie developer track and Push the Frontier theme.
Its linked [waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver)
was not retrievable through the research tool. The accessible page does not specify
video duration, all final submission fields or the full current contest rules.
The three-minute script is provisional. Eligibility, account acceptance, exact
video requirements and submission confirmation remain unverified; no submission
is claimed complete.
