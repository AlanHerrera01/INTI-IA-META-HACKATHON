"""Typed local document production. Never executes scripts or overwrites files."""

import hashlib
import io
import json
from collections.abc import Callable
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from inti.domain.documents import DOCUMENT_OUTPUTS, DocumentPlan


def money(cents: int) -> str:
    return f"{cents / 100:,.2f}"


def write_word(plan: DocumentPlan, path: Path) -> None:
    from docx import Document
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Inches, Pt, RGBColor

    request = plan.document_request
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.top_margin = section.bottom_margin = Inches(1)
    section.left_margin = section.right_margin = Inches(1)
    for name, size, color in (
        ("Normal", 10, "14202E"),
        ("Title", 27, "14202E"),
        ("Heading 1", 14, "14202E"),
        ("Subtitle", 10, "486071"),
    ):
        style = doc.styles[name]
        style.font.name, style.font.size, style.font.color.rgb = (
            "Arial",
            Pt(size),
            RGBColor.from_string(color),
        )
        style.paragraph_format.space_after = Pt(8)
    header = section.header.paragraphs[0]
    run = header.add_run("INTI AI  /  ECUADOR")
    run.bold, run.font.size, run.font.color.rgb = True, Pt(10), RGBColor.from_string("B87918")
    doc.add_paragraph("COTIZACIÓN", "Title")
    doc.add_paragraph(f"{request.reference}  ·  Propuesta comercial", "Subtitle")
    doc.add_heading("Datos del cliente", level=1)
    for label, value in (
        ("Cliente", request.customer),
        ("Contacto", request.contact),
        ("Correo", request.email),
        ("Ciudad", request.city),
        ("Emisión", str(request.issued)),
        ("Válida hasta", str(request.valid_until)),
    ):
        p = doc.add_paragraph()
        p.add_run(label + ": ").bold = True
        p.add_run(value)
    doc.add_heading("Detalle de la propuesta", level=1)
    table = doc.add_table(rows=1, cols=4)
    table.autofit = False
    widths = (4800, 900, 1800, 1860)
    for cell, text in zip(
        table.rows[0].cells, ("Descripción", "Cant.", "Unitario USD", "Total USD"), strict=True
    ):
        cell.text = text
    for item in request.items:
        for cell, text in zip(
            table.add_row().cells,
            (
                item.description,
                str(item.quantity),
                money(item.unit_cents),
                money(item.quantity * item.unit_cents),
            ),
            strict=True,
        ):
            cell.text = text
    table._tbl.tblPr.find(qn("w:tblW")).set(qn("w:w"), "9360")
    table._tbl.tblPr.find(qn("w:tblW")).set(qn("w:type"), "dxa")
    for col, width in zip(table._tbl.tblGrid, widths, strict=True):
        col.set(qn("w:w"), str(width))
    for index, row in enumerate(table.rows):
        for cell, width in zip(row.cells, widths, strict=True):
            cell._tc.get_or_add_tcPr().find(qn("w:tcW")).set(qn("w:w"), str(width))
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_after = Pt(7)
                paragraph.paragraph_format.space_before = Pt(7)
                for run in paragraph.runs:
                    run.font.size = Pt(9)
                    if index == 0:
                        run.font.color.rgb = RGBColor(255, 255, 255)
                        run.bold = True
            if index == 0:
                shade = OxmlElement("w:shd")
                shade.set(qn("w:fill"), "14202E")
                cell._tc.get_or_add_tcPr().append(shade)
    doc.add_paragraph(f"Subtotal: USD {money(request.subtotal_cents)}")
    doc.add_paragraph(
        f"Impuesto ({request.tax_basis_points / 100:.2f}%): USD {money(request.tax_cents)}"
    )
    p = doc.add_paragraph()
    p.add_run(f"TOTAL: USD {money(request.total_cents)}").bold = True
    if request.notes:
        doc.add_heading("Condiciones", level=1)
        doc.add_paragraph(request.notes)
    section.footer.paragraphs[
        0
    ].text = "INTI AI · Elaborado con datos aprobados · Sin firma ni envío automático"
    doc.save(path)


def write_excel(plan: DocumentPlan, path: Path) -> None:
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, Reference
    from openpyxl.styles import Alignment, Font, PatternFill

    request = plan.document_request
    book = Workbook()
    sheet = book.active
    sheet.title = "Presupuesto"
    sheet.append(["INTI AI / PRESUPUESTO", request.reference])
    sheet.append(["Cliente", request.customer])
    sheet.append(["Impuesto (%)", request.tax_basis_points / 100])
    sheet.append(["Fecha", str(request.issued), "Válido hasta", str(request.valid_until)])
    sheet.append([])
    sheet.append(["Descripción", "Cantidad", "Unitario USD", "Total USD"])
    cached = {}
    for row, item in enumerate(request.items, 7):
        sheet.append(
            [item.description, item.quantity, item.unit_cents / 100, f"=ROUND(B{row}*C{row},2)"]
        )
        cached[f"D{row}"] = item.quantity * item.unit_cents / 100
    subtotal_row = 7 + len(request.items)
    sheet.cell(subtotal_row, 3, "Subtotal")
    sheet.cell(subtotal_row, 4, f"=SUM(D7:D{subtotal_row - 1})")
    sheet.cell(subtotal_row + 1, 3, "Impuesto")
    sheet.cell(subtotal_row + 1, 4, f"=ROUND(D{subtotal_row}*$B$3/100,2)")
    sheet.cell(subtotal_row + 2, 3, "TOTAL USD")
    sheet.cell(subtotal_row + 2, 4, f"=D{subtotal_row}+D{subtotal_row + 1}")
    cached.update(
        {
            f"D{subtotal_row}": request.subtotal_cents / 100,
            f"D{subtotal_row + 1}": request.tax_cents / 100,
            f"D{subtotal_row + 2}": request.total_cents / 100,
        }
    )
    for col, width in (("A", 54), ("B", 15), ("C", 20), ("D", 21)):
        sheet.column_dimensions[col].width = width
    sheet.freeze_panes, sheet.auto_filter.ref = "B7", f"A6:D{subtotal_row - 1}"
    for row in sheet:
        for cell in row:
            cell.font = Font(name="Aptos", size=11, color="14202E")
            cell.alignment = Alignment(vertical="center", wrap_text=True)
        sheet.row_dimensions[row[0].row].height = 29
    for row in (1, 6, subtotal_row + 2):
        for cell in sheet[row]:
            cell.fill, cell.font = (
                PatternFill("solid", fgColor="14202E"),
                Font(name="Aptos", color="FFFFFF", bold=True, size=11),
            )
    for row in range(7, subtotal_row + 3):
        sheet[f"C{row}"].number_format = sheet[f"D{row}"].number_format = '"$"#,##0.00'
    chart = BarChart()
    chart.title, chart.y_axis.title = "Importe por partida", "USD"
    chart.add_data(
        Reference(sheet, min_col=4, min_row=6, max_row=subtotal_row - 1), titles_from_data=True
    )
    chart.set_categories(Reference(sheet, min_col=1, min_row=7, max_row=subtotal_row - 1))
    chart.width, chart.height = 24, 10
    sheet.add_chart(chart, f"A{subtotal_row + 5}")
    check = book.create_sheet("Comprobaciones")
    check.append(["Control", "Esperado USD", "Documento USD", "Resultado"])
    check.append(
        [
            "Total de la cotización",
            request.total_cents / 100,
            f"=Presupuesto!D{subtotal_row + 2}",
            '=IF(ROUND(B2-C2,2)=0,"OK","REVISAR")',
        ]
    )
    for col in ("A", "B", "C", "D"):
        check.column_dimensions[col].width = 28
    book.save(path)
    # OOXML cached results make the first view correct before Excel recalculates.
    original = path.read_bytes()
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with ZipFile(io.BytesIO(original)) as source, ZipFile(path, "w", ZIP_DEFLATED) as output:
        for entry in source.infolist():
            data = source.read(entry.filename)
            if entry.filename == "xl/worksheets/sheet1.xml":
                xml = ET.fromstring(data)
                for cell in xml.findall(".//s:c", ns):
                    if cell.get("r") in cached:
                        value = cell.find("s:v", ns)
                        if value is None:
                            value = ET.SubElement(cell, "{" + ns["s"] + "}v")
                        value.text = str(cached[cell.get("r")])
                data = ET.tostring(xml, encoding="utf-8", xml_declaration=True)
            elif entry.filename == "xl/worksheets/sheet2.xml":
                xml = ET.fromstring(data)
                for cell in xml.findall(".//s:c", ns):
                    if cell.get("r") in {"C2", "D2"}:
                        value = cell.find("s:v", ns)
                        if value is None:
                            value = ET.SubElement(cell, "{" + ns["s"] + "}v")
                        if cell.get("r") == "D2":
                            cell.set("t", "str")
                            value.text = "OK"
                        else:
                            value.text = str(request.total_cents / 100)
                data = ET.tostring(xml, encoding="utf-8", xml_declaration=True)
            output.writestr(entry, data)


def write_pdf(plan: DocumentPlan, path: Path) -> None:
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    request = plan.document_request
    styles = getSampleStyleSheet()
    styles["Title"].textColor = colors.HexColor("#14202e")
    doc = SimpleDocTemplate(
        str(path),
        pagesize=(8.5 * inch, 11 * inch),
        leftMargin=54,
        rightMargin=54,
        topMargin=45,
        bottomMargin=45,
    )
    story = [
        Paragraph("INTI AI / ECUADOR", styles["Heading2"]),
        Paragraph("COTIZACIÓN", styles["Title"]),
        Paragraph(escape(request.reference), styles["Heading2"]),
    ]
    for label, value in (
        ("Cliente", request.customer),
        ("Contacto", request.contact),
        ("Correo", request.email),
        ("Ciudad", request.city),
        ("Emisión", str(request.issued)),
        ("Validez", str(request.valid_until)),
    ):
        story.append(Paragraph(f"<b>{label}:</b> {escape(value)}", styles["Normal"]))
        story.append(Spacer(1, 7))
    story.append(Spacer(1, 18))
    rows = [["Descripción", "Cant.", "Unitario USD", "Total USD"]]
    rows += [
        [
            Paragraph(escape(item.description), styles["Normal"]),
            str(item.quantity),
            money(item.unit_cents),
            money(item.quantity * item.unit_cents),
        ]
        for item in request.items
    ]
    table = Table(rows, colWidths=[260, 45, 95, 104], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#14202e")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("LINEBELOW", (0, 0), (-1, 0), 2, colors.HexColor("#ffb95f")),
                ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor("#dce4e9")),
            ]
        )
    )
    story += [
        table,
        Spacer(1, 20),
        Paragraph(f"Subtotal: USD {money(request.subtotal_cents)}", styles["Normal"]),
        Paragraph(
            f"Impuesto ({request.tax_basis_points / 100:.2f}%): USD {money(request.tax_cents)}",
            styles["Normal"],
        ),
        Paragraph(f"TOTAL: USD {money(request.total_cents)}", styles["Heading1"]),
        Paragraph(escape(request.notes), styles["Normal"]),
        Spacer(1, 20),
        Paragraph(
            "Datos aprobados por el operador. Sin firma ni envío automático.", styles["Italic"]
        ),
    ]
    doc.build(story)


def create_document_package(
    plan: DocumentPlan,
    root: Path,
    allowed: Callable[[], bool],
    progress: Callable[[list[dict]], None] | None = None,
) -> list[dict]:
    from docx import Document
    from openpyxl import load_workbook

    from inti.local_agent import reject_links

    root = root.absolute()
    reject_links(root)
    if Path(plan.authorized_root).resolve() != root.resolve():
        raise ValueError("Task folder differs from the locally authorized folder")
    receipts = []

    def check() -> None:
        if not allowed():
            raise ValueError("Document workflow cancelled; existing outputs are retained")

    def record(receipt: dict) -> None:
        receipts.append(receipt)
        if progress:
            progress(receipts)

    check()
    folder = root / str(plan.id)
    folder.mkdir(exist_ok=False)
    reject_links(folder)
    record({"id": "validate_document_data", "status": "VALIDATED", "sha256": plan.digest()})
    request = plan.document_request
    for (step, name), writer in zip(
        DOCUMENT_OUTPUTS[:4], (write_word, write_excel, write_pdf, None), strict=True
    ):
        check()
        target = folder / name
        reject_links(target)
        if target.exists():
            raise ValueError("Document output already exists; no overwrite is allowed")
        if writer:
            writer(plan, target)
        else:
            target.write_text(request.summary(), encoding="utf-8")
        reject_links(target)
        content = target.read_bytes()
        if name.endswith(".docx"):
            doc = Document(target)
            text = "\n".join(p.text for p in doc.paragraphs)
            if request.customer not in text or money(request.total_cents) not in text:
                raise ValueError("Word readback does not match the approved request")
        elif name.endswith(".xlsx"):
            book = load_workbook(target, data_only=True)
            total = book["Presupuesto"][f"D{len(request.items) + 9}"].value
            book.close()
            if total is None or round(total * 100) != request.total_cents:
                raise ValueError("Excel cached total does not match the approved request")
        elif name.endswith(".pdf") and not (
            content.startswith(b"%PDF-") and b"%%EOF" in content[-100:]
        ):
            raise ValueError("PDF file is incomplete")
        record(
            {
                "id": step,
                "status": "VERIFIED_READBACK",
                "path": str(target),
                "sha256": hashlib.sha256(content).hexdigest(),
                "bytes": len(content),
            }
        )
    check()
    # Reopen and hash every output again after the full package was produced.
    for receipt in receipts[1:]:
        target = Path(receipt["path"])
        reject_links(target)
        if hashlib.sha256(target.read_bytes()).hexdigest() != receipt["sha256"]:
            raise ValueError("A generated document changed before final verification")
    manifest = {
        "plan_digest": plan.digest(),
        "reference": request.reference,
        "total_cents": request.total_cents,
        "files": receipts[1:],
        "verification": "agent_readback_not_independent_visual_verification",
    }
    target = folder / "manifest.json"
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    content = target.read_bytes()
    record(
        {
            "id": "verify_document_package",
            "status": "VERIFIED_READBACK",
            "path": str(target),
            "sha256": hashlib.sha256(content).hexdigest(),
            "bytes": len(content),
        }
    )
    return receipts
