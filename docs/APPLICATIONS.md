# Windows applications

In **Computer Control / Control del equipo**, open **Applications on this computer /
Aplicaciones de este equipo**. Choose the paired PC, search its detected desktop
applications and review the executable path. Authorizing an entry grants permission
to prepare a launch. It does not run it. Prepare the launch, review the exact
application/path/identity/digest, then approve that one task.

The agent launches a freshly rediscovered local executable with no arguments and
without a shell. Discovery reads Windows App Paths and Start Menu shortcuts that
have no arguments, plus fixed Notepad/Calculator entries. Packaged WindowsApps
executables, aliases/reparse points and known console interpreters are excluded.
This is a compatible desktop catalog, not a complete inventory of installed apps.
The interface uses generic application icons.

Permissions belong to one paired device and survive normal agent restarts. A
catalog entry change resets its permission and cancels affected pending tasks.
Removing a permission also cancels pending/running launches; it cannot close an
application whose launch already occurred. Catalogs expire after 90 seconds and
are normally refreshed every 30 seconds. Offline or stale catalogs cannot prepare
or approve launches. A final server permission check occurs after rediscovery,
immediately before the launch request.

The executable identity records path and filesystem metadata (size, modification
time and file identity). It is not a signed binary attestation. Receipts report
`LAUNCH_REQUESTED` and do not independently certify a visible window or control
inside that application. No model calls are required or performed.

Validation completed:

- 38 computer/agent/catalog API and unit tests passed.
- The full frontend regression passed 151 tests; a subsequent application-review
  case and the final focused frontend run passed 12 cases.
- Type checking and lint passed for the affected code.
- A real paired Windows agent detected the catalog. Through the actual web UI,
  Notepad was authorized, prepared as a draft, reviewed, approved and requested.
  Its path, identity, PID and launch receipt matched the approved task. Its test
  permission was removed afterward.
- Spanish/English layouts passed at 1366, 1600 and 1920 pixels with no page errors.

See [the real task evidence](evidence/applications-ui.json),
[Spanish dashboard](screenshots/computer/applications-es.png), and
[exact approval](screenshots/computer/application-exact-approval.png).

For another PC, download the updated agent ZIP. Retain that installation's `.local`
credentials and `workspace` when updating and restart its agent. The dashboard
shows an update/reconnect message until it receives a recent catalog. Credentials
and complete installed-app inventories are not included in shareable evidence.
