# Evidence model and provenance

`Evidence` records an immutable logical ledger entry containing UUID, verification
session UUID, evidence type, source, UTC capture time, UUID artifact reference,
SHA-256 and typed metadata. Metadata binds source system, method, asset, task,
execution, verification, nonce, source URL, source-store identity, role, MIME type
and byte count. Baselines additionally bind the approved criteria artifact/hash,
collection UUID and pre-execution timestamp.

## Implemented collection

| Type | Collected source | What it establishes |
|---|---|---|
| DATABASE_STATE | Fresh fixed-SQL read-only SQLite snapshot via authenticated gateway | Bounded persisted rows and store identity |
| READ_ONLY_API_RESPONSE | Same snapshot response recorded separately | Transport/source context; not a second independent read |
| SCREENSHOT | New isolated read-only Chromium context | Visible state, not persistence |
| DOM_SNAPSHOT | Fixed trusted DOM extraction from that new context | Current URL and target visibility |
| EXECUTION_TRACE | Stored execution history, labelled supplementary | Attempted actions and immediate checks only |
| APPLICATION_EVENT | Domain type supported; no collector implemented | No business proof generated |

An ordinary successful collection creates seven final/supplementary evidence
entries; a pre-execution baseline adds one. The two API/state pairs intentionally
share bytes and an artifact. They are correlated views, not four independent
database reads. Requests use independent nonces before and after browser capture.

## Canonical hashing and storage

Structured artifacts use UTF-8 sorted-key JSON with deterministic separators and
integral-number normalization. NaN/Infinity are rejected. Screenshots hash exact
PNG bytes. Artifacts use UUID-only `.bin` names, size bounds, append-exclusive
creation, fsync, path validation and symlink rejection. Large binaries remain in
the artifact volume, outside PostgreSQL. Existing observation PNGs remain intact.

Logical ledger entries are append-only through application ports. Storage is
ordinary filesystem storage: administrators can alter it. Artifact duplication
within one collection is deduplicated by hash; immutable provenance entries retain
their own identities. Artifact retention/garbage collection is not implemented;
interrupted writes may leave an unreferenced artifact that needs later collection.

## Validation order

1. Check SHA-256 and byte count.
2. Check verification/task/execution/target correlation.
3. Check capture chronology after execution and verification start; reject future
   timestamps and stale final evidence (default 30 seconds).
4. Bind baseline to criteria and verify it precedes execution.
5. Validate the exact trusted source URL, source type and canonical JSON schema.
6. Bind request collection UUID, nonce, asset, task and execution; bind store/time.
7. Evaluate only evidence types appropriate to the requested assertion.

The source has a fixed 1,000-row limit and response-byte bound. It rejects arbitrary
query inspection and exposes no SQL or filesystem path parameter. A missing source
produces evidence-collection failure events and UNKNOWN criteria, not a positive
claim. Replay, stale/future capture, forged source/target/nonce and artifact
modification are exercised in automated tests.

Every metadata, report and binary route requires the existing operator capability.
Capabilities remain in frontend memory and bearer headers, never artifact URLs,
WebSocket query parameters or local storage. Report HTML escapes untrusted values
and uses a restrictive CSP. Do not publish private screenshots by default.
