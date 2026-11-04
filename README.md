# INTI AI

INTI connects a web dashboard to a paired Windows agent. Review a task, approve its exact contents, and watch real local actions progress.

The default runtime has **three containers: PostgreSQL, backend and frontend**. The Windows agent runs on the computer itself, outside Docker. Existing inventory volumes and history are retained separately.

## Start

Requirements: Docker Desktop with Linux containers.

```powershell
./scripts/start_computer.ps1
```

Open http://localhost:5173. The script generates an operator capability in ignored `.env` if needed. Copy `EXECUTION_OPERATOR_TOKEN` privately into **Operator capability** in the dashboard. It stays in browser memory and clears on reload. Never share `.env`.

The Windows dashboard supports **Español / English** using the language selector in the top bar. Spanish is the initial language. The preference is saved in this browser; switching languages preserves task inputs and operator access. Task contents, paths, URLs and exported API identifiers are kept as entered. The optional historical inventory pages retain their original language.

The complete navigation remains available: Overview, AI Agent Studio, Live Execution, Visual Observations, Task Manager, Computers & Applications, Recovery Center, Verification Lab, Analytics & Benchmarks, AI Models, Activity Logs and Settings. In local mode these sections use the paired computer's task ledger, device context and action receipts. Computer Control, Computer Tasks and Computers & Permissions are additional routes under `/computer`; they do not replace the main navigation.

Each main tab retains its own visual composition: the Overview pipeline, Studio composer, three-column execution console, task ledger/inspector, recovery comparison, verification evidence panels, model cards, settings modules, analytics chart and activity feed. See [the restored designs](docs/RESTORED-TAB-DESIGNS.md). The target is the paired local computer; unavailable measurements and screenshots remain explicitly empty.

The current local workflow is: inspect connected context, prepare a typed task, review/approve, execute on the paired computer, inspect recorded evidence, and prepare a fresh reviewed draft after interruption. Desktop screenshot capture, visual model reasoning, independent visual outcome verification and automatic model-based repair still need a local-agent implementation. Their pages state these limits explicitly and show no demo data. Recovery never automatically replays an interrupted action.

Use `-SkipBuild` for an already built installation, or `-BuildCaPem <path>` for a corporate certificate. TLS verification stays enabled.

## Pair Windows

1. Connect the operator capability and open **Computers & Permissions**.
2. Download the Windows agent ZIP, extract it into a folder you own, and run `Start-INTI-Agent.ps1`. Python 3.12+ and internet access to install dependencies are required on first launch.
3. Generate a pairing code in the dashboard and enter it in the agent console. Codes expire after five minutes and can be used once.
4. Keep the agent running. Its extracted `workspace` folder is the authorized location for new text files. Device credentials stay in its private `.local` folder; never share it.

On the same PC, the backend is `http://127.0.0.1:8000`. For another Windows PC, pass `-Backend https://your-reachable-backend` to the launcher and deploy the backend behind HTTPS. Docker binds only to localhost by default; remote access requires deployment configuration. The agent polls outbound and opens no listening control port.

## Visible sample

In **Computer Control**, choose the computer, filename, contents and HTTP(S) browser page. Click **Prepare plan**, then **Review & execute** and approve the displayed snapshot. Approval is tied to its exact manifest digest.

The agent creates a new task folder and text file, reads it back and matches its contents, requests Notepad to open it, and requests the approved page in the default browser. The dashboard shows individual receipts and exports JSON. File readback is separate from application launch requests: visible windows and loaded pages are not independently verified.

The dashboard also includes **Applications on this computer / Aplicaciones de este equipo**. The updated Windows agent detects compatible local desktop executables from App Paths and Start Menu shortcuts without arguments. Search by name, inspect the executable path, and explicitly authorize an application. **Prepare application launch** creates a draft; review and approve the exact plan to request its opening without arguments. Removing permission cancels pending launches. It does not close an already opened application.

The catalog refreshes approximately every 30 seconds and expires after 90 seconds. If an executable's path, size, modification time or file identity changes, its permission is reset and affected pending plans are canceled. The agent rediscovers and checks the selected entry immediately before requesting its launch. Store apps, shortcuts requiring arguments and known console interpreters are excluded. This is not a complete inventory of every installed program. Generic application icons identify catalog entries.

Download the new agent ZIP and restart the agent to enable application discovery on another computer. Keep its existing `.local` credentials and `workspace` when updating; a new agent installation needs pairing. INTI reports an application launch request, not independent visual confirmation. Permission to open an application does not grant permission or the ability to control its contents.

This release uses explicitly authored sample/application plans and makes **zero model calls**. Arbitrary natural-language desktop tasks, macOS and Linux agents are not implemented.

## Stop and recover

Cancel stops remaining actions; existing files and windows are retained. Device revocation blocks further claims. Ctrl+C in the agent console stops it. Heartbeats expire after 30 seconds.

The agent journals before execution and never automatically replays interrupted actions. It retries result acknowledgements. If an outage expires the server lease and acknowledgement is rejected, stop the agent and inspect its `.pending.json` journal and task folder before manually archiving the journal. Never remove a journal while the agent runs or assume a missing receipt means an action did not happen. Progress includes a one-second pause per step for visibility; this is not a performance benchmark.

## Development and previous phases

Rebuild the credential-free download with `python scripts/package_local_agent.py` after editing the agent or command schema. Tests cover approval, pairing, revocation, cancellation, file readback, replay prevention and frontend behavior.

The previous browser execution, recovery and verification implementation is preserved in [inventory sandbox documentation](README.inventory.md). Start that optional six-service runtime with `scripts/start_demo.ps1`; do not run both modes simultaneously under the same Compose project. Its fixture-based model results are not live-model evaluations. No changes are published automatically.
