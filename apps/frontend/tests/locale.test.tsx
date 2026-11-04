import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../src/i18n/LocaleProvider";
import { LanguageSelector } from "../src/i18n/LanguageSelector";
import { useLocale } from "../src/i18n/useLocale";

function Example() {
  const { t } = useLocale();
  return (
    <>
      <LanguageSelector />
      <h1>{t("Computer Control")}</h1>
    </>
  );
}
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("starts in Spanish and persists switching to English across remounts", async () => {
  const view = render(
    <LocaleProvider>
      <Example />
    </LocaleProvider>,
  );
  expect(
    screen.getByRole("heading", { name: "Control del equipo" }),
  ).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("es");
  fireEvent.change(screen.getByLabelText("Idioma / Language"), {
    target: { value: "en" },
  });
  expect(
    screen.getByRole("heading", { name: "Computer Control" }),
  ).toBeInTheDocument();
  await waitFor(() => expect(localStorage.getItem("inti.language")).toBe("en"));
  expect(document.documentElement.lang).toBe("en");
  view.unmount();
  render(
    <LocaleProvider>
      <Example />
    </LocaleProvider>,
  );
  expect(
    screen.getByRole("heading", { name: "Computer Control" }),
  ).toBeInTheDocument();
});

it("still switches when the browser blocks storage", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(
    <LocaleProvider>
      <Example />
    </LocaleProvider>,
  );
  fireEvent.change(screen.getByLabelText("Idioma / Language"), {
    target: { value: "en" },
  });
  expect(
    screen.getByRole("heading", { name: "Computer Control" }),
  ).toBeInTheDocument();
});
