# Meta Global AI Developer Hackathon 2026 — form answers

Copy-paste draft based on the current INTI AI build and recorded evidence.
Do not submit the demo-video placeholder: paste the final YouTube URL first.

## Team

- **Team name:** DON BUG GPT
- **Members:** Alan Herrera (Alan01)

## Track

**Indie developer track**

## Problem statement / theme

**Push the Frontier**

## Project description

INTI AI is a local-first desktop agent that gives one operator an auditable
control surface for work performed on a Windows PC. A bilingual Spanish/English
dashboard pairs with an agent on the operator's machine. From it the operator can:

- Pair a computer with a one-time code, inspect installed applications, grant or
  revoke per-device permissions, and see device state.
- Capture an allowlisted web viewport and, with a configured Meta key, have Muse
  Spark turn it into a typed scene of elements, UI state and uncertainties.
- Convert a goal and constraints into a typed plan with ordered actions, targets,
  preconditions, expected results and risk levels; unsafe proposals are rejected
  and planning never authorizes execution.
- Approve the exact plan by SHA-256 digest, with separate confirmation for
  high-risk actions; any edit invalidates approval.
- Execute approved actions in the synthetic Chromium inventory sandbox or on the
  local PC: create and read back text files, request Notepad or an approved
  HTTP(S) page, and launch authorized applications without arguments. Progress
  arrives as live events and per-action receipts; browser sessions pause and
  resume, remaining work can be cancelled, and history exports as JSON.
- Generate a document dossier in a fresh task folder (Word quotation, Excel
  budget with live formulas, native chart and reconciliation sheet, print-ready
  PDF, text summary and SHA-256 manifest), then reopen it to check fields, totals,
  structure and hashes.
- Diagnose failed sandbox executions with a bounded repair plan that requires
  fresh approval and never replays actions automatically.
- Verify sandbox outcomes independently: re-read persisted state, evaluate
  explicit criteria, collect hash-checked evidence, and issue VERIFIED_SUCCESS,
  VERIFIED_FAILURE or INCONCLUSIVE with JSON/HTML reports.
- Review measured latency, throughput and verification results, with unavailable
  metrics left blank instead of estimated.

It is a single-operator local release. The agent writes only inside the approved
workspace and task folder, never overwrites, signs or sends files, and exposes no
shell, deletion or arbitrary-executable command. Desktop screenshot capture,
independent desktop-vision verification and automatic model calls are not
implemented or disabled by default.

## Use of Meta products

INTI uses the Meta Model API with `muse-spark-1.3` as its visual-reasoning layer.
The adapter sends a PNG viewport as an `image_url` data URL and requests a strict
`json_schema` response; responses are validated into typed scene, intent and plan
models. It bounds retries, output tokens, response bytes and total time, honours
`Retry-After`, does not follow redirects, and never logs credentials or response
bodies. The same adapter is wired for the three-stage screenshot → scene → intent
→ typed-plan path in the browser sandbox.

For the submission we ran one explicit, operator-confirmed calibration: INTI
generated a 512×320 synthetic image with a green target rectangle, sent it to
Muse Spark and asked for a pixel inside the target. The call returned HTTP 200, a
coordinate inside the target (1/1 grounding hit), 3.42 s mean latency and 42.15
output tokens/s. That is one sample, not a benchmark. Automatic task-model calls
are disabled by default (`MISSION_MODEL_CALLS_ENABLED=false`); without a key, a
Meta mission fails explicitly with `MODEL_CALLS_DISABLED` instead of inventing a
plan. The document workflow is deterministic and makes zero model calls, so
judges can reproduce the demo without credentials. We did not integrate SAM 3.1,
Muse Image, Muse Wonder or Muse Code.

## Why Meta's models are important to the solution

Desktop automation needs a model that can both see a UI and emit actions we can
validate. Muse Spark's image understanding plus strict JSON-schema output lets
INTI turn a screenshot into typed coordinates and a typed plan without a second
model or fragile prompt parsing. That visual grounding is the part deterministic
code cannot replace; everything around it (approval, execution, verification)
stays deterministic and auditable. Using one provider for image input, structured
output and predictable latency also keeps the local agent's request path small
enough to reason about. Our measured 3.42 s sample is acceptable for an
approval-gated step, but one sample is not evidence of planning quality; a larger
evaluation is the next step. In short, Meta supplies the "see and reason" layer,
and INTI supplies the "act and verify" contract.

## Feedback from partner technologies

Our feedback is based on one real Meta Model API call, so it is narrow. What
worked well: the OpenAI-style `POST /chat/completions` contract, bearer auth,
`image_url` data URLs and `response_format: json_schema` were straightforward to
implement; the first live call returned a valid structured object with usage
fields, and 3.42 s was acceptable for an approval-gated step. What was harder:
the largest cost was onboarding, not code. The docs did not let us confirm account
model access without spending a real call, and we could not find a documented
model-list or free entitlement check. Token usage is documented as optional, so
throughput can be unknown when a response omits it; our one response did include
it. Strict nested schemas would benefit from copy-paste examples and a
validator/playground. The adapter's safe errors are correctly terse, but a
documented error-code table would make quota and entitlement debugging faster. A
small hackathon sandbox quota, a `/models` endpoint and clearer documentation of
quota/rate-limit headers would have removed most of that friction. We did not
test SAM 3.1, Muse Image or Muse Code.

## Links

- **Public GitHub repository:** https://github.com/AlanHerrera01/INTI-IA-META-HACKATHON
- **3-minute demo video:** upload `inti-video/out/INTI-Hackathon.mp4` to YouTube,
  then replace this line with the URL
- **Most Viral X post:** no post exists yet; leave blank unless one is published

## Before submitting

1. Commit and push the local work the video shows. The public repository is at
   `7824eae`; the document workflow, model evaluation/metrics, video project and
   new docs are uncommitted or untracked.
2. Upload the rendered 2:11 video and replace the placeholder URL.
3. Update the stale statements in `docs/SUBMISSION.md` (it still says the video
   was not recorded and the form was not submitted) or remove that file from the
   public repository.
4. Optionally add the non-secret calibration record from
   `.local/authorized-model-calibration-20261103.json` under `docs/evidence/`.
5. Do not claim SAM 3.1, Muse Image, Muse Code, live Meta planning, Word UI
   automation or independent desktop-vision verification.
