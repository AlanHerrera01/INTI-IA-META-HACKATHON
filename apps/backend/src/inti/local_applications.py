"""Windows desktop discovery and no-argument launch, confined to local catalog entries."""

import hashlib
import json
import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

from inti.domain.computer import ComputerApplication

BLOCKED = {
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
    "wscript.exe",
    "cscript.exe",
    "mshta.exe",
    "rundll32.exe",
    "regsvr32.exe",
    "msiexec.exe",
    "reg.exe",
    "schtasks.exe",
    "python.exe",
    "pythonw.exe",
    "py.exe",
    "node.exe",
    "bash.exe",
    "wsl.exe",
    "wt.exe",
    "windowsterminal.exe",
    "conhost.exe",
    "installutil.exe",
}


def application_entry(name: str, path: Path) -> ComputerApplication | None:
    try:
        if not path.is_absolute() or str(path).startswith("\\\\"):
            return None
        if path.suffix.lower() != ".exe" or path.name.lower() in BLOCKED:
            return None
        if any(part.casefold() == "windowsapps" for part in path.parts):
            return None
        # Reject junctions, executable aliases and symlinks; no shortcuts are launched.
        for part in [path, *path.parents]:
            info = part.lstat()
            if part.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
                return None
        stat = path.stat()
        if not path.is_file():
            return None
        canonical = str(path.resolve()).casefold()
        identity = f"{canonical}:{stat.st_size}:{stat.st_mtime_ns}:{stat.st_ino}"
        return ComputerApplication(
            id=hashlib.sha256(canonical.encode()).hexdigest(),
            name=name[:160],
            path=str(path.resolve()),
            identity=hashlib.sha256(identity.encode()).hexdigest(),
        )
    except (OSError, ValueError):
        return None


def discover_applications() -> list[ComputerApplication]:
    if sys.platform != "win32":
        raise ValueError("Application discovery requires Windows")
    import winreg

    candidates: list[tuple[str, Path]] = []
    system = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"
    candidates += [("Notepad", system / "notepad.exe"), ("Calculator", system / "calc.exe")]
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for access in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
            try:
                with winreg.OpenKey(
                    hive,
                    r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths",
                    0,
                    winreg.KEY_READ | access,
                ) as key:
                    for index in range(winreg.QueryInfoKey(key)[0]):
                        name = winreg.EnumKey(key, index)
                        try:
                            with winreg.OpenKey(key, name) as child:
                                value, _ = winreg.QueryValueEx(child, "")
                            if isinstance(value, str):
                                candidates.append(
                                    (Path(name).stem, Path(os.path.expandvars(value).strip('"')))
                                )
                        except OSError:
                            continue
            except OSError:
                continue
    # Fixed discovery script: shortcut arguments, working directories and icons are ignored.
    # Paths are JSON data, never interpolated into shell commands or launched as .lnk files.
    script = r"""
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$shell=New-Object -ComObject WScript.Shell
$roots=@([Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('CommonStartMenu'))
$apps=@(foreach($root in $roots){
  Get-ChildItem -LiteralPath $root -Filter *.lnk -Recurse -File `
    -ErrorAction SilentlyContinue | ForEach-Object {
    $link=$shell.CreateShortcut($_.FullName)
    if($link.TargetPath -and -not $link.Arguments){
      [pscustomobject]@{name=$_.BaseName;path=$link.TargetPath}
    }
  }
})
ConvertTo-Json -InputObject $apps -Compress
"""
    powershell = system / "WindowsPowerShell/v1.0/powershell.exe"
    result = subprocess.run(
        [str(powershell), "-NoProfile", "-NonInteractive", "-Command", script],
        shell=False,
        capture_output=True,
        timeout=25,
        check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    rows = json.loads(result.stdout.decode("utf-8-sig"))
    candidates += [(row["name"], Path(row["path"])) for row in rows]
    catalog = {}
    for name, path in candidates:
        entry = application_entry(name, path)
        if entry:
            catalog[entry.id] = entry
    return sorted(catalog.values(), key=lambda app: app.name.casefold())[:300]


def launch_application(
    approved: ComputerApplication,
    still_allowed: Callable[[], bool] | None = None,
) -> dict:
    # Re-discover immediately before launch. The server cannot choose an arbitrary path.
    actual = next((app for app in discover_applications() if app.id == approved.id), None)
    if actual != approved:
        raise ValueError("Application changed or disappeared; refresh and authorize it again")
    fresh = application_entry(actual.name, Path(actual.path))
    if fresh != approved:
        raise ValueError("Application identity changed before launch")
    if still_allowed is not None and not still_allowed():
        raise ValueError("Application launch cancelled before execution")
    process = subprocess.Popen([actual.path], cwd=str(Path(actual.path).parent), shell=False)
    return {
        "id": "open_application",
        "status": "LAUNCH_REQUESTED",
        "path": actual.path,
        "application_id": actual.id,
        "identity": actual.identity,
        "pid": process.pid,
    }
