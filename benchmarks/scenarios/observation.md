# Phase 1 observation scenario

Target: synthetic INTI inventory demo. Viewport: 1440 × 900.

1. Start PostgreSQL, demo, backend, frontend.
2. Open the dashboard and capture an observation.
3. Verify PNG dimensions, source URL, title, UTC timestamp, and persisted UUID.
4. Refresh the dashboard and verify the same observation remains visible.
5. Attempt a non-allowlisted URL; expect HTTP 422 without remote navigation.
6. Without Meta credentials, expect configured=false and HTTP 503 for analysis.
7. With valid credentials, request interpretation and inspect actual normalized output.

This is an acceptance scenario, not a performance benchmark. No latency, accuracy,
or recovery benchmark is claimed. Automated evidence lives in tests/e2e.
