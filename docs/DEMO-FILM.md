# Demo film

The repository ships with a produced hackathon film that demonstrates the real
local runtime rather than a slide deck or a mocked interface. The film is the
shortest path to understanding the operator workflow described in
[`DOCUMENT-WORKFLOW.md`](DOCUMENT-WORKFLOW.md) and the guarantees summarized in
the root [`README.md`](../README.md).

<p align="center">
  <img src="assets/readme/demo-film-final-frame.png" width="100%" alt="Closing frame of the INTI AI demo film" />
</p>

<p align="center"><sub>Closing frame of the 1920×1080 film. The composition credits the project as <b>Creado en Ecuador, por DonBugGPT -AVHA</b>.</sub></p>

## Format

| Property | Value |
|---|---|
| Runtime | **131.43 s** (2:11) |
| Resolution and frame rate | 1920×1080 at 30 fps |
| Narration | English neural voice |
| Captions | Synchronized Spanish subtitles |
| Music | Original electronic underscore generated for this film |
| Edit basis | Measured speech durations, short gaps, continuous music |
| Original outline | 175 s, condensed to emphasize actual application operation |

## What the film shows

The film follows one real document task, `INTI-EC-104`, for a fictitious
customer quotation. It records the operator entering the form, hitting a required
email validation error, correcting it, reviewing the exact plan digest, approving
it, and watching the paired Windows agent execute.

The agent completes **six actions** and saves **five files** inside a fresh
task folder:

1. `cotizacion.docx` — Word quotation.
2. `presupuesto.xlsx` — Excel budget with formulas, a native chart and a
   reconciliation sheet.
3. `cotizacion.pdf` — rendered PDF quotation.
4. `resumen.txt` — plain-text summary.
5. `manifest.json` — integrity manifest binding each output to the approved plan
   digest.

The reviewed total is **USD 5,462.50**. The footage includes real form entry,
exact-digest approval, execution and the saved receipts. No new Meta requests
were used to create the workflow or record the film.

## How the film relates to this repository

The film is a demonstration of the same code and documentation in this
repository, not a separate prototype:

- **Runtime.** It records the React dashboard, FastAPI backend, PostgreSQL
  ledger and outbound Windows agent described in
  [the root README](../README.md#architecture) and
  [`LOCAL-COMPUTER.md`](LOCAL-COMPUTER.md).
- **Workflow.** Preparation, exact approval, device claim, execution and
  receipts match the state machine and sequence diagrams in the root README.
- **Documents.** Inputs, fixed output names, integer-cent money handling and
  agent-reported readback checks match [`DOCUMENT-WORKFLOW.md`](DOCUMENT-WORKFLOW.md).
- **Model measurements.** The single calibration shown is the explicitly
  confirmed call described in [`MODEL-MEASUREMENTS.md`](MODEL-MEASUREMENTS.md).

## Honest scope

- Word and Excel inserts are readable content/data views extracted from the
  actual saved files, **not** recordings of Microsoft Office. The PDF insert is
  the actual rendered PDF.
- The installed Word automation export stalled, so DOCX validation in this film
  is structural/readback validation. No successful Word page-render QA is
  claimed. Native PDF visual QA passed.
- File checks are agent readback, not an independent desktop-vision verdict.
- The model scene uses the previously authorized **single** real synthetic
  calibration: **3.42 s** and **42.15 reported output tokens/s**, with **one
  target hit**. It is explicitly one sample, not a benchmark.
- Automatic task-model calls remain disabled. The workflow itself used zero
  automatic model calls.
- No automatic visual self-healing, general-purpose desktop control or
  comparative benchmark is presented as implemented.

## Where the production sources live

The Remotion composition, narration tooling, capture scripts and raw renders are
kept in the local `inti-video/` workspace and are intentionally **not** committed
to this repository. That folder contains `node_modules`, local captures and a
large MP4 export, and some capture tooling depends on a prepared local runtime.

This page and the curated stills under
[`docs/assets/readme/`](assets/readme) are the committed record of the film.
Regenerating the edit requires the original local workspace; viewing or
reviewing the committed repository does not.
