"""Reviewed local-computer commands. No shell or arbitrary executable operations."""

import hashlib
import json
import re
from pathlib import PureWindowsPath
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ComputerPlan(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: UUID
    device_id: UUID
    authorized_root: str = Field(min_length=1, max_length=1024)
    filename: str = Field(default="INTI-notes.txt", max_length=80)
    content: str = Field(min_length=1, max_length=16000)
    url: str = Field(default="http://localhost:5173/", max_length=2048)
    source: str = "authored_local_sample"

    @field_validator("filename")
    @classmethod
    def safe_filename(cls, value: str) -> str:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 _-]{0,70}\.txt", value):
            raise ValueError("Use a simple .txt filename without path separators")
        stem = value[:-4].upper()
        if stem in {
            "CON",
            "PRN",
            "AUX",
            "NUL",
            *(f"COM{i}" for i in range(1, 10)),
            *(f"LPT{i}" for i in range(1, 10)),
        }:
            raise ValueError("Reserved Windows filename")
        return value

    @field_validator("url")
    @classmethod
    def browser_url(cls, value: str) -> str:
        url = urlsplit(value)
        if (
            url.scheme not in {"http", "https"}
            or not url.hostname
            or url.username
            or url.password
            or any(c.isspace() or ord(c) < 32 for c in value)
        ):
            raise ValueError("Use an absolute http(s) URL without credentials or whitespace")
        return value

    @field_validator("source")
    @classmethod
    def authored_source(cls, value: str) -> str:
        if value != "authored_local_sample":
            raise ValueError("This release supports explicitly authored local tasks only")
        return value

    def digest(self) -> str:
        payload = json.dumps(
            self.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    def steps(self) -> list[dict[str, str]]:
        return [
            {"id": "write_file", "action": "Create a new text file", "target": self.filename},
            {
                "id": "open_notepad",
                "action": "Request Notepad to open that file",
                "target": self.filename,
            },
            {
                "id": "open_browser",
                "action": "Request the default browser to open the approved URL",
                "target": self.url,
            },
        ]


class ComputerApplication(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str = Field(pattern=r"^[a-f0-9]{64}$")
    name: str = Field(min_length=1, max_length=160)
    path: str = Field(min_length=1, max_length=1024)
    identity: str = Field(pattern=r"^[a-f0-9]{64}$")

    @field_validator("path")
    @classmethod
    def executable_path(cls, value: str) -> str:
        path = PureWindowsPath(value)
        if not path.is_absolute() or value.startswith("\\\\") or path.suffix.lower() != ".exe":
            raise ValueError("Application must be a local absolute executable path")
        if any(ord(c) < 32 for c in value) or ":" in value[2:]:
            raise ValueError("Invalid application path")
        return value


class ApplicationLaunchPlan(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: Literal["open_application"] = "open_application"
    id: UUID
    device_id: UUID
    authorized_root: str
    application: ComputerApplication
    source: Literal["authored_application_launch"] = "authored_application_launch"

    def digest(self) -> str:
        payload = json.dumps(
            self.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    def steps(self) -> list[dict[str, str]]:
        return [
            {
                "id": "open_application",
                "action": "Request the approved application to open",
                "target": self.application.name,
            }
        ]


def parse_computer_plan(value: dict) -> ComputerPlan | ApplicationLaunchPlan:
    if value.get("kind") == "create_documents":
        from inti.domain.documents import DocumentPlan
        return DocumentPlan.model_validate(value)
    if value.get("kind") == "open_application":
        return ApplicationLaunchPlan.model_validate(value)
    return ComputerPlan.model_validate(value)
