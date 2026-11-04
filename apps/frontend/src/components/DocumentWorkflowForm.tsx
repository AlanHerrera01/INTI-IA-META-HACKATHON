import { useState } from "react";
import { FileText, Plus, Trash2, ShieldCheck } from "lucide-react";
import {
  computerApi,
  type ComputerDevice,
  type ComputerTask,
  type DocumentRequest,
} from "../services/computerApi";
import { errorMessage } from "../services/api";
import { useLocale } from "../i18n/useLocale";

const empty: DocumentRequest = {
  reference: "",
  customer: "",
  contact: "",
  email: "",
  city: "",
  issued: new Date().toISOString().slice(0, 10),
  valid_until: "",
  tax_basis_points: 1500,
  notes: "",
  items: [{ description: "", quantity: 1, unit_cents: 0 }],
};

export function DocumentWorkflowForm({
  token,
  devices,
  deviceId,
  onDevice,
  onPrepared,
}: {
  token: string;
  devices: ComputerDevice[];
  deviceId: string;
  onDevice: (id: string) => void;
  onPrepared: (task: ComputerTask) => void;
}) {
  const { t, dateLocale } = useLocale();
  const [form, setForm] = useState<DocumentRequest>(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const total = form.items.reduce(
    (sum, item) => sum + item.quantity * item.unit_cents,
    0,
  );
  const tax = Math.floor((total * form.tax_basis_points + 5000) / 10000);
  const usd = (value: number) =>
    new Intl.NumberFormat(dateLocale, {
      style: "currency",
      currency: "USD",
    }).format(value / 100);
  const change = (key: keyof DocumentRequest, value: string | number) =>
    setForm((current) => ({ ...current, [key]: value }));
  const device = devices.find((item) => item.id === deviceId);
  const online = device && Date.now() / 1000 - device.last_seen < 30;
  const submit = async () => {
    setError("");
    if (
      !form.customer.trim() ||
      !form.contact.trim() ||
      !form.city.trim() ||
      !form.email.includes("@") ||
      !form.valid_until ||
      !form.reference ||
      form.items.some(
        (item) =>
          item.description.trim().length < 3 ||
          item.quantity < 1 ||
          item.unit_cents < 1,
      )
    ) {
      setError(
        t(
          "Complete the customer, contact, dates and item fields before preparing the dossier.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      onPrepared(await computerApi.prepareDocuments(token, deviceId, form));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="document-workflow" aria-label={t("Document dossier")}>
      <div className="document-workflow-intro">
        <FileText size={22} />
        <div>
          <h2>{t("Quotation & purchase dossier")}</h2>
          <p>
            {t(
              "Fill one structured request. INTI fills Word, calculates Excel, produces PDF and checks the saved package after approval.",
            )}
          </p>
        </div>
      </div>
      <div className="document-workflow-grid">
        <label>
          {t("Computer")}
          <select
            aria-label={t("Document computer")}
            value={deviceId}
            onChange={(e) => onDevice(e.target.value)}
          >
            {!deviceId && (
              <option value="">{t("Pair a Windows agent first")}</option>
            )}
            {devices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Quotation reference")}
          <input
            aria-label={t("Quotation reference")}
            maxLength={24}
            value={form.reference}
            onChange={(e) => change("reference", e.target.value.toUpperCase())}
            placeholder="INTI-EC-104"
          />
        </label>
        <label>
          {t("Customer name")}
          <input
            aria-label={t("Customer name")}
            maxLength={80}
            value={form.customer}
            onChange={(e) => change("customer", e.target.value)}
          />
        </label>
        <label>
          {t("Contact name")}
          <input
            aria-label={t("Contact name")}
            maxLength={70}
            value={form.contact}
            onChange={(e) => change("contact", e.target.value)}
          />
        </label>
        <label>
          {t("Contact email")}
          <input
            aria-label={t("Contact email")}
            type="email"
            value={form.email}
            onChange={(e) => change("email", e.target.value)}
          />
        </label>
        <label>
          {t("City")}
          <input
            aria-label={t("City")}
            value={form.city}
            onChange={(e) => change("city", e.target.value)}
          />
        </label>
        <label>
          {t("Issue date")}
          <input
            aria-label={t("Issue date")}
            type="date"
            value={form.issued}
            onChange={(e) => change("issued", e.target.value)}
          />
        </label>
        <label>
          {t("Valid until")}
          <input
            aria-label={t("Valid until")}
            type="date"
            value={form.valid_until}
            onChange={(e) => change("valid_until", e.target.value)}
          />
        </label>
      </div>
      <div className="document-items-heading">
        <h3>{t("Products & services")}</h3>
        <button
          disabled={form.items.length >= 8 || busy}
          onClick={() =>
            setForm((current) => ({
              ...current,
              items: [
                ...current.items,
                { description: "", quantity: 1, unit_cents: 0 },
              ],
            }))
          }
        >
          <Plus size={14} />
          {t("Add item")}
        </button>
      </div>
      <div className="document-items">
        {form.items.map((item, index) => (
          <div className="document-item" key={index}>
            <label>
              {t("Description")}
              <input
                aria-label={`${t("Description")} ${index + 1}`}
                maxLength={70}
                value={item.description}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    items: current.items.map((row, i) =>
                      i === index
                        ? { ...row, description: e.target.value }
                        : row,
                    ),
                  }))
                }
              />
            </label>
            <label>
              {t("Quantity")}
              <input
                aria-label={`${t("Quantity")} ${index + 1}`}
                type="number"
                min={1}
                max={10000}
                value={item.quantity}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    items: current.items.map((row, i) =>
                      i === index
                        ? { ...row, quantity: Number(e.target.value) }
                        : row,
                    ),
                  }))
                }
              />
            </label>
            <label>
              {t("Unit price USD")}
              <input
                aria-label={`${t("Unit price USD")} ${index + 1}`}
                type="number"
                min="0.01"
                step="0.01"
                value={item.unit_cents / 100 || ""}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    items: current.items.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            unit_cents: Math.round(
                              Number(e.target.value) * 100,
                            ),
                          }
                        : row,
                    ),
                  }))
                }
              />
            </label>
            <strong>{usd(item.quantity * item.unit_cents)}</strong>
            <button
              aria-label={`${t("Remove item")} ${index + 1}`}
              disabled={form.items.length === 1 || busy}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  items: current.items.filter((_, i) => i !== index),
                }))
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="document-workflow-grid">
        <label>
          {t("Tax rate (%)")}
          <input
            aria-label={t("Tax rate (%)")}
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={form.tax_basis_points / 100}
            onChange={(e) =>
              change(
                "tax_basis_points",
                Math.round(Number(e.target.value) * 100),
              )
            }
          />
        </label>
        <div className="document-total">
          <span>
            {t("Subtotal")}: {usd(total)} · {t("Tax")}: {usd(tax)}
          </span>
          <strong>
            {t("Total")}: {usd(total + tax)}
          </strong>
        </div>
      </div>
      <label>
        {t("Conditions & notes")}
        <textarea
          aria-label={t("Conditions & notes")}
          maxLength={350}
          value={form.notes}
          onChange={(e) => change("notes", e.target.value)}
        />
      </label>
      <div className="document-output-chips">
        <span>Word · .docx</span>
        <span>Excel · .xlsx</span>
        <span>PDF</span>
        <span>{t("Summary")}</span>
        <span>SHA-256 · manifest</span>
      </div>
      {error && (
        <p role="alert" className="computer-error">
          {error}
        </p>
      )}
      <p className="native-note">
        {t(
          "Structured templates; no model-generated plan, signatures or external submissions. Existing files are never overwritten.",
        )}
      </p>
      <button
        className="computer-primary"
        disabled={busy || !token || !online}
        onClick={() => void submit()}
      >
        <ShieldCheck size={16} />
        {t(busy ? "Preparing…" : "Prepare document dossier")}
      </button>
    </section>
  );
}
