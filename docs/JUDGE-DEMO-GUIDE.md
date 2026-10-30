# INTI AI — Judge Demo Guide

A 5-minute live walkthrough of the local release. No model key is required for the
authored path. The guide never asks you to bypass approval or trust a fixture.

## 1. Prerequisites

- Docker Desktop with Linux containers running.
- Ports `5173`, `8000`, `8001`, `8002`, `5432` free.
- `.env` with distinct capabilities (at least 24 characters):
  `EXECUTION_OPERATOR_TOKEN`, `BROWSER_WORKER_TOKEN`,
  `VERIFICATION_READ_TOKEN`, `DEMO_FAULT_CONTROL_TOKEN`.
- Optional on TLS-intercepting networks: a trusted CA PEM.

Start:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_demo.ps1
# If your network intercepts TLS:
powershell -ExecutionPolicy Bypass -File .\scripts\start_demo.ps1 -BuildCaPem .\.tmp\build-ca.pem
```

Confirm:

```powershell
docker compose ps
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
Invoke-RestMethod http://127.0.0.1:8000/api/v1/capabilities | ConvertTo-Json
```

Expected: all six services healthy; version `0.7.0`; execution, verification,
recovery and demo controls enabled; `model_calls_enabled` and `model_configured`
`false` unless you explicitly configured a Meta key.

Open <http://localhost:5173/?guided=1>.

## 2. Connect (15 seconds)

1. Find **Operator capability** under the health tiles.
2. Paste `EXECUTION_OPERATOR_TOKEN` from your local `.env`.
3. Click **Connect**.

Expected: “Connected · held in memory”; recent missions and activity load. The
token is not stored in localStorage and is cleared on reload.

## 3. Guided tracker (20 seconds)

The **INTI-DEMO-001 · judge walkthrough** panel derives its state from the backend:

- completed steps show a check;
- the next actionable step shows `NEXT`;
- unavailable dependencies show `BLOCKED`.

This is not a click-through checklist. It cannot approve or start anything.

## 4. Reset the synthetic store (30 seconds)

1. In **Synthetic demo controls**, confirm `PC-104` is shown.
2. Click **Reset demo**.
3. Read the dialog: it names the current store UUID and says only that synthetic
   store is affected.
4. Click **Confirm synthetic reset**.

Expected: `PC-104 · Inactive`. If an execution or verification is active, reset
fails with `DEMO_BUSY`; this is intentional.

## 5. Create and prepare (45 seconds)

1. In **Quick task**, keep the prefilled objective:
   “Find asset PC-104, change its status to Operational, and verify the persisted
   result.”
2. Keep **Authored sandbox · no model** selected.
3. Click **Create mission**.
4. On the mission card, click **Capture interface & prepare plan**.
5. Open **Inspect plan**.

Expected: one stable mission ID; a nine-step authored plan; explicit source label
“AUTHORED PLAN · NO MODEL REASONING”; risk levels and provenance visible.

> Authored means the recipe is fixed. It is not Meta-generated planning. Browser
> execution and verification are real.

## 6. Approve and execute (60 seconds)

1. Click **Review & run execution**.
2. In Live Execution, review the manifest and click **Approve plan**.
3. Approve the HIGH-risk save action separately when prompted.
4. Click **Start execution**.

Expected: real browser results appear with status and duration. Execution ends
`COMPLETED`. Completion alone is not a verdict.

## 7. Recovery: show the dependency (30 seconds)

1. Return to Mission Control.
2. The guided tracker’s recovery step is `BLOCKED` while Meta calls are disabled.
3. Open the **Capability status** card: “Live Meta recovery — Unavailable.”

Expected behavior if you try to arm the fault: `LIVE_RECOVERY_BLOCKED`. The app does
not substitute a fixture response.

The recovery mechanics are covered by
`apps/backend/tests/integration/test_missions.py`. That test injects a real fault,
uses a fixture only for diagnosis, performs a real browser repair and runs real
verification. It is explicitly labeled as fixture-based, not live Meta.

## 8. Independent verification (45 seconds)

1. Click **Inspect outcome evidence**.
2. Review the verdict badge, criteria table, observed vs expected values and
   evidence list.
3. Confirm each evidence item reports intact integrity.

Expected on the happy path: `VERIFIED_SUCCESS`, all criteria PASS, evidence hashes
intact. The verifier reads fresh persisted state through a read-only plane.

## 9. Persisted state and benchmark (30 seconds)

1. Return to Mission Control.
2. Confirm the demo controls show `PC-104 · Operational`.
3. Open **Benchmark Lab**.

Expected: measured report with denominators. Current source:

- 5 deterministic fault trials;
- expected verdict agreement 5/5;
- verified task success 1/5;
- false-positive detection 3/3;
- inconclusive 1/5;
- mean verification latency ~3290 ms;
- model calls 0.

`Unavailable`: comparative evaluation, recovery success rate, execution latency,
unsafe-action count. These are not estimated.

## 10. Optional: reproduce from the command line

```powershell
.\.venv\Scripts\python.exe scripts\live_demo_check.py
```

This performs the authored scenario against the running stack, including reset,
real browser execution, independent verification, a Meta-dependency check and a
benchmark read. It writes `docs/evidence/phase7-live-demo.json`.

## What to look for as a judge

- Does the UI distinguish authored planning from Meta planning?
- Are plan approval and HIGH-action approval separate?
- Does execution completion stay separate from verification?
- Does the verifier use fresh persisted state rather than the execution result?
- Are missing capabilities and metrics labeled, not guessed?
- Is the demo reset restricted to synthetic data?
- Does the repository contain real evidence rather than mockups?

## Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| `MODEL_CALLS_DISABLED` | Meta calls disabled | Expected. Use authored mode, or configure a key and restart with `-EnableModelCalls` |
| `LIVE_RECOVERY_BLOCKED` | Live recovery needs Meta | Expected in this environment; see the fixture test |
| `DEMO_BUSY` | Execution/verification active | Wait or cancel, then reset |
| `401`/`403` | Wrong or missing operator token | Re-enter `EXECUTION_OPERATOR_TOKEN` |
| Frontend shows “Unavailable” | Backend not healthy | `docker compose ps`, then inspect backend logs |
| Build fails on TLS | Corporate interception | Pass `-BuildCaPem` with the trusted CA; never disable TLS |
| Reset disabled | Demo controls off | Run `scripts/start_demo.ps1` |

## Honest answers to likely questions

**Is this using Meta?**
Not in the recorded authored path. Meta integration exists, but this environment has
no key and model calls are disabled. A Meta mission fails explicitly instead of
falling back.

**Did recovery work?**
Recovery mechanics are implemented and tested with a real fault and real browser
repair, using a fixture only for diagnosis. Live Meta recovery is blocked here.

**What is the success rate?**
On the committed 5-fault verification mix, verified task success is 1/5. That is not
a model-quality or general reliability claim.

**Is this production ready?**
No. It is a local single-operator release with one synthetic target.

**Was this submitted?**
No submission is claimed from this environment. See `docs/SUBMISSION.md`.

## Final reproducibility checks

`scripts/verify_clean_start.ps1` checks fresh configuration/data with existing built images in an isolated temporary Docker project and preserves main-project history. `live_demo_check.py --arm-fault` exits 2 with BLOCKED before reset or execution if live Meta recovery is unavailable; this is an explicit blocked trial, not a successful recovery.
