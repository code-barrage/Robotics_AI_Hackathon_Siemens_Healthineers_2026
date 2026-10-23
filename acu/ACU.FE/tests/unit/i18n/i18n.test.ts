import { describe, it, expect } from "vitest";
import { en } from "../../../src/i18n/en";
import { de } from "../../../src/i18n/de";

// TypeScript's `Dict = typeof en` already makes a *missing* de key a compile
// error. These tests cover what typing does not: extra de keys and empty
// strings that would ship a blank label to users.
describe("i18n dictionaries", () => {
  it("German has no keys that English lacks", () => {
    const extraInDe = Object.keys(de).filter((k) => !(k in en));
    expect(extraInDe).toEqual([]);
  });

  it("has no empty strings in either locale", () => {
    const empties = [...Object.entries(en), ...Object.entries(de)]
      .filter(([, v]) => typeof v === "string" && v.trim() === "")
      .map(([k]) => k);
    expect(empties).toEqual([]);
  });
});
