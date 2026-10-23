import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider, useI18n, useT } from "../../../src/i18n/I18nProvider";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
);

describe("I18nProvider", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to English when nothing is stored", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.lang).toBe("en");
  });

  it("remembers a stored language", () => {
    localStorage.setItem("acu_lang", "de");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.lang).toBe("de");
  });

  it("switches language and persists the choice", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLang("de"));
    expect(result.current.lang).toBe("de");
    expect(localStorage.getItem("acu_lang")).toBe("de");
  });

  it("translates a key and substitutes variables", () => {
    const { result } = renderHook(() => useT(), { wrapper });
    // agoSecondsMany contains a {count} placeholder in both dictionaries.
    const out = result.current("agoSecondsMany", { count: 5 });
    expect(out).toContain("5");
    expect(out).not.toContain("{count}");
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useI18n())).toThrow();
  });
});
