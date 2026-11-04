import { Languages } from "lucide-react";
import { useLocale } from "./useLocale";

export function LanguageSelector() {
  const { language, setLanguage } = useLocale();
  return (
    <label className="language-selector">
      <Languages size={16} aria-hidden="true" />
      <select
        aria-label="Idioma / Language"
        value={language}
        onChange={(event) =>
          setLanguage(event.target.value === "en" ? "en" : "es")
        }
      >
        <option value="es">Español</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
