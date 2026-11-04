import hashlib
import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from inti.domain.computer import parse_computer_plan
from inti.domain.documents import DocumentPlan, DocumentRequest
from inti.local_agent import execute_task


def request():
    return DocumentRequest(
        reference="INTI-EC-104",
        customer="Cliente ficticio Andes",
        contact="Daniela Demo",
        email="demo@example.com",
        city="Quito",
        issued="2026-11-03",
        valid_until="2026-11-18",
        tax_basis_points=1500,
        items=[
            {"description": "Estacion de trabajo", "quantity": 4, "unit_cents": 85000},
            {"description": "Configuracion y soporte", "quantity": 1, "unit_cents": 25000},
        ],
        notes="Datos ficticios para la demostracion. Sin envio ni firma.",
    )


def plan(root):
    data = request()
    return DocumentPlan(
        id=uuid4(),
        device_id=uuid4(),
        authorized_root=str(root),
        filename="resumen.txt",
        content=data.summary(),
        document_request=data,
    )


def test_totals_validation_and_digest_cover_all_document_fields(tmp_path):
    p = plan(tmp_path)
    assert p.document_request.total_cents == 419750
    assert parse_computer_plan(p.model_dump(mode="json")) == p
    assert len(p.steps()) == 6
    altered = p.model_dump(mode="json")
    altered["document_request"]["customer"] = "Otro cliente"
    with pytest.raises(ValidationError):
        parse_computer_plan(altered)
    with pytest.raises(ValidationError):
        DocumentRequest(**{**request().model_dump(mode="json"), "valid_until": "2026-10-01"})


def test_real_package_has_formulas_matching_files_and_never_launches_apps(tmp_path):
    pytest.importorskip("docx")
    pytest.importorskip("openpyxl")
    pytest.importorskip("reportlab")
    from docx import Document
    from openpyxl import load_workbook

    p = plan(tmp_path)
    task = {"plan": p.model_dump(mode="json"), "digest": p.digest()}

    def launch(*args):
        pytest.fail("Document generation must not launch applications")

    result = execute_task(task, tmp_path, lambda: True, notepad=launch, browser=launch)
    assert result["ok"], result["error"]
    assert len(result["steps"]) == 6
    folder = tmp_path / str(p.id)
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["plan_digest"] == p.digest()
    for item in manifest["files"]:
        content = (folder / item["path"].split(str(folder))[-1].lstrip("/\\")).read_bytes()
        assert hashlib.sha256(content).hexdigest() == item["sha256"]
    doc = Document(folder / "cotizacion.docx")
    assert "Cliente ficticio Andes" in " ".join(p.text for p in doc.paragraphs)
    book = load_workbook(folder / "presupuesto.xlsx", data_only=False)
    assert book["Presupuesto"]["D7"].value == "=ROUND(B7*C7,2)"
    book.close()
    book = load_workbook(folder / "presupuesto.xlsx", data_only=True)
    assert book["Presupuesto"]["D11"].value == 4197.5
    book.close()
    again = execute_task(task, tmp_path, lambda: True, notepad=launch, browser=launch)
    assert not again["ok"]
    assert (folder / "manifest.json").exists()


def test_cancellation_preserves_completed_outputs_and_rejects_manifest_tampering(tmp_path):
    pytest.importorskip("docx")
    pytest.importorskip("openpyxl")
    pytest.importorskip("reportlab")
    p = plan(tmp_path)
    progress = []
    result = execute_task(
        {"plan": p.model_dump(mode="json"), "digest": p.digest()},
        tmp_path,
        lambda: len(progress) < 2,
        on_step=lambda steps: progress.append(list(steps)),
    )
    assert not result["ok"]
    assert len(result["steps"]) == 2
    assert (tmp_path / str(p.id) / "cotizacion.docx").exists()
    bad = execute_task(
        {"plan": p.model_dump(mode="json"), "digest": "0" * 64}, tmp_path, lambda: True
    )
    assert not bad["ok"] and not bad["steps"]
