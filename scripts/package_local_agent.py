"""Build a source-only agent ZIP from an explicit allowlist; no local secrets."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/frontend/public/downloads/inti-local-agent.zip"


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    source = ROOT / "apps/backend/src"
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
        for file in ["inti/__init__.py", "inti/domain/__init__.py", "inti/domain/computer.py", "inti/domain/documents.py", "inti/local_agent.py", "inti/local_applications.py", "inti/local_documents.py"]:
            archive.write(source / file, file)
        archive.write(ROOT / "scripts/agent-bundle/Start-INTI-Agent.ps1", "Start-INTI-Agent.ps1")
        archive.writestr("requirements.txt", "httpx>=0.28,<1\npydantic>=2.10,<3\npython-docx>=1.2,<2\nopenpyxl>=3.1,<4\nreportlab>=4,<6\n")
        archive.writestr("README.txt", "INTI Windows agent - Python 3.12+ required.\nExtract into a folder owned by your Windows user.\nRun PowerShell: powershell -ExecutionPolicy Bypass -File .\\Start-INTI-Agent.ps1\nFor a remote server add -Backend https://your-server.example (HTTPS required).\nCreate a one-use pairing code in INTI and enter it in the agent console.\nOnly workspace/<task-id>/<name>.txt can be created; no overwrite or arbitrary shell commands.\nCompatible desktop applications are detected and need explicit operator permission plus exact task approval.\nApplication launches use a detected executable without arguments; this does not control its contents.\nThe local credential in .local must remain private. Never share .local or .venv.\nReview the device folder, text and URL in INTI before approving each task.\nCtrl+C stops the agent; earlier files and windows remain.\nThis release requests Windows Notepad/browser launches; visual app completion is not certified.\nMac/Linux and unrestricted desktop control are not supported in this release.\n")
    print(f"Agent package ready: {OUTPUT.name}")


if __name__ == "__main__":
    main()
