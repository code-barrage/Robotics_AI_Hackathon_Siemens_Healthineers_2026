import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../../src/i18n/I18nProvider";
import CTCompanionView from "../../src/features/ct/CTCompanionView";

describe("CTCompanionView", () => {
  it("embeds the clinician companion and clearly labels its scanner boundary", () => {
    render(<I18nProvider><CTCompanionView /></I18nProvider>);

    expect(screen.getByTitle("CT Companion")).toHaveAttribute("src", "http://localhost:8000/acu");
    expect(screen.getByRole("link", { name: "Open clinician view in a new tab" }))
      .toHaveAttribute("href", "http://localhost:8000/acu");
    expect(screen.getByText(/Research prototype only/))
      .toHaveTextContent("It does not connect to or control a CT scanner.");
    expect(screen.getByText(/The reference lists eight orientations/))
      .toHaveTextContent("does not validate full patient orientation");
  });
});
