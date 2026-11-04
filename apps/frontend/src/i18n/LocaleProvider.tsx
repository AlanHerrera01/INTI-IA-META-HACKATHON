import { useEffect, useState, type ReactNode } from "react";
import { LocaleContext } from "./useLocale";
import { translate, type Language } from "./messages";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem("inti.language") === "en" ? "en" : "es";
    } catch {
      return "es";
    }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("inti.language", language);
    } catch {
      // The selector remains usable when browser storage is unavailable.
    }
  }, [language]);
  return (
    <LocaleContext.Provider
      value={{
        language,
        setLanguage,
        t: (message) => translate(language, message),
        dateLocale: language === "es" ? "es-CO" : "en-US",
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}
