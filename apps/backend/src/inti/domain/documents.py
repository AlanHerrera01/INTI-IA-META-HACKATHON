"""Bounded, explicitly reviewed document-production contract."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from inti.domain.computer import ComputerPlan


class QuoteItem(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)
    description: str = Field(min_length=3, max_length=70)
    quantity: int = Field(ge=1, le=10000, strict=True)
    unit_cents: int = Field(ge=1, le=100_000_000, strict=True)


class DocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)
    reference: str = Field(pattern=r"^[A-Z0-9][A-Z0-9-]{2,23}$")
    customer: str = Field(min_length=3, max_length=80)
    contact: str = Field(min_length=3, max_length=70)
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=100)
    city: str = Field(min_length=2, max_length=60)
    issued: date
    valid_until: date
    tax_basis_points: int = Field(default=1500, ge=0, le=10000, strict=True)
    items: tuple[QuoteItem, ...] = Field(min_length=1, max_length=8)
    notes: str = Field(default="", max_length=350)

    @field_validator("customer", "contact", "city", "notes")
    @classmethod
    def printable(cls, value: str) -> str:
        if any(ord(char) < 32 for char in value):
            raise ValueError("Document fields cannot contain control characters")
        return value

    @model_validator(mode="after")
    def valid_dates(self) -> "DocumentRequest":
        if not 0 <= (self.valid_until - self.issued).days <= 365:
            raise ValueError("Validity must end within 365 days after issue date")
        if self.total_cents > 1_000_000_000:
            raise ValueError("Document total exceeds the supported limit")
        return self

    @property
    def subtotal_cents(self) -> int:
        return sum(item.quantity * item.unit_cents for item in self.items)

    @property
    def tax_cents(self) -> int:
        return (self.subtotal_cents * self.tax_basis_points + 5000) // 10000

    @property
    def total_cents(self) -> int:
        return self.subtotal_cents + self.tax_cents

    def summary(self) -> str:
        lines = [
            f"COTIZACION {self.reference}",
            f"Cliente: {self.customer}",
            f"Contacto: {self.contact} | {self.email}",
            f"Ciudad: {self.city}",
            f"Emision: {self.issued} | Validez: {self.valid_until}",
            "",
        ]
        lines += [
            f"{item.description} | {item.quantity} x USD {item.unit_cents / 100:.2f}"
            f" = USD {item.quantity * item.unit_cents / 100:.2f}"
            for item in self.items
        ]
        lines += [
            "",
            f"Subtotal USD {self.subtotal_cents / 100:.2f}",
            f"Impuesto ({self.tax_basis_points / 100:.2f}%) USD {self.tax_cents / 100:.2f}",
            f"TOTAL USD {self.total_cents / 100:.2f}",
            self.notes,
            "Datos revisados por el operador. Generacion mediante plantilla estructurada.",
        ]
        return "\n".join(lines)


DOCUMENT_OUTPUTS = (
    ("write_quote_docx", "cotizacion.docx"),
    ("write_budget_xlsx", "presupuesto.xlsx"),
    ("write_quote_pdf", "cotizacion.pdf"),
    ("write_document_summary", "resumen.txt"),
    ("verify_document_package", "manifest.json"),
)


class DocumentPlan(ComputerPlan):
    kind: Literal["create_documents"] = "create_documents"
    document_request: DocumentRequest

    @model_validator(mode="after")
    def exact_summary(self) -> "DocumentPlan":
        if self.content != self.document_request.summary() or self.filename != "resumen.txt":
            raise ValueError("Document summary differs from the structured request")
        return self

    def steps(self) -> list[dict[str, str]]:
        return [
            {
                "id": "validate_document_data",
                "action": "Validate fields and integer-cent totals",
                "target": self.document_request.reference,
            }
        ] + [
            {"id": step, "action": action, "target": name}
            for (step, name), action in zip(
                DOCUMENT_OUTPUTS,
                (
                    "Fill the Word quotation template",
                    "Calculate the Excel budget",
                    "Generate the PDF quotation",
                    "Write the approved document summary",
                    "Reopen outputs and verify the package manifest",
                ),
                strict=True,
            )
        ]
