import { createContext, useContext } from "react";
import type { Language } from "./messages";

export const LocaleContext = createContext({
  language: "en" as Language,
  setLanguage: (() => {}) as (language: Language) => void,
  t: (message: string) => message,
  dateLocale: "en-US",
});
export const useLocale = () => useContext(LocaleContext);
