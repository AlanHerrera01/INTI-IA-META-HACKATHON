# Local computer sample

Per-tab visual compositions have been restored using their original stylesheet
layouts and paired-agent data. See [restored tab designs](RESTORED-TAB-DESIGNS.md).
The generic local workflow page is no longer used for main navigation routes.

The full original sidebar is restored. Local Overview, planning, execution,
tasks, recovery, verification, analytics and activity share the same actual
computer task ledger. Hardware shows paired device records. Visual Observations
shows the agent context/catalog and explicitly states that desktop screenshots
and visual reasoning are pending. Recovery prepares a new draft requiring fresh
approval; it does not replay an action. Computer-specific pages have independent
`/computer`, `/computer/tasks` and `/computer/permissions` paths.

The default Compose runtime uses only PostgreSQL, backend and frontend. The old
demo, inventory-state and browser-worker containers were removed without removing
their data volumes. The optional inventory runtime is in `docker-compose.legacy.yml`.

The Windows agent now also publishes compatible desktop applications. The web
panel lets the operator search the catalog, inspect executable paths, grant or
remove per-device application permission, and prepare a one-step launch plan.
Launching still requires approval of the exact manifest. Catalog changes reset
permissions and cancel affected pending launches; stale catalogs fail closed.
The launch receipt is separate from visual completion and from control inside
the application. See the current [setup and application guide](../README.md).

A Windows agent was paired on the host and the sample was approved through the
actual web dashboard. The task created a new UTF-8 text file in the authorized
workspace and returned three receipts. The check script independently read that
file and matched its content and SHA-256. Notepad and default-browser requests
were recorded as `LAUNCH_REQUESTED`; visible window/page completion is not certified.

- [Recorded UI sample](screenshots/computer/real-windows-sample.webm)
- [Real action receipts](evidence/local-computer-sample.json)
- [Dashboard](screenshots/computer/03-real-action-receipts.png)
- [Computer permissions](screenshots/computer/05-computers-permissions.png)

Planning is an authored three-action sample, with zero model calls. Arbitrary
desktop planning/control and agents for other operating systems remain future work.
Pairing and manifest approval are required for every new device/task. No shell,
deletion, arbitrary executable or unrestricted keyboard/mouse command exists.

Validation: 145 frontend tests passed, including seven computer UI cases.
The final computer backend tests passed 26 cases, including expired leases,
immutable progress, exact approval, one-use pairing, cancellation, revocation,
file readback and launch-vs-visual-verification distinctions. Type checking and
lint passed. Browser checks found no JavaScript errors or horizontal overflow at
1366, 1600 and 1920 pixels. The downloadable ZIP uses an explicit source allowlist
and contains no credentials, local state, or task artifacts.

The complete historical backend regression was attempted on the host's Python
3.14. It did not finish: Windows reported a native access violation (exit
`0xC0000005`) while threads were loading modules/reading legacy verification
records. The complete suite is therefore not reported as passing. The old real
inventory execution test passed when isolated; the 26 computer tests passed.
The deployed backend uses Python 3.12. This host test-runtime issue remains open.

Use [the setup guide](../README.md) for installation, another Windows computer,
stopping/revoking the agent, and interruption recovery. Credentials are kept in
ignored `.env` and agent `.local` state and must not accompany shared evidence.
# Local environment configuration

`.env` and `.env.example` have the same six keys in three ordered sections:
local runtime, operator token/database password, and optional Meta configuration.
The startup script generates an empty operator token. Backend defaults supply
technical limits; default Docker Compose disables legacy workers and model calls.
The previous private settings are retained in ignored
`.local/env-before-cleanup.backup`; do not share this backup.
