/**
 * PayMongo merchant-review disclosures. PayMongo reads the live site before
 * approving a merchant, so what matters is that each policy renders for a
 * signed-out visitor, that the footer reaches all four, and that a field ADVO
 * has not supplied yet shows the gap rather than an invented registration
 * number or address.
 */
import { createElement } from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import LandingFooter from "@/components/landing/landing-footer";
import Terms from "@/pages/legal/Terms";
import Privacy from "@/pages/legal/Privacy";
import Refund from "@/pages/legal/Refund";
import Dispute from "@/pages/legal/Dispute";
import {
  isIdentityPending,
  legalIdentity,
  pendingIdentityField,
} from "@/lib/legal-identity";

vi.mock("@/lib/api", () => ({
  get: async () => ({ data: null }),
  post: async () => ({ data: null }),
}));

const disclosure = [
  { route: "/terms", title: "Terms and Conditions", page: Terms },
  { route: "/privacy", title: "Privacy Policy", page: Privacy },
  { route: "/refund", title: "Return and Refund Policy", page: Refund },
  { route: "/dispute", title: "Dispute Resolution Policy", page: Dispute },
];

/** No auth provider on purpose — a reviewer reads these signed out. */
const renderPublic = (element: Parameters<typeof createElement>[0], route: string) =>
  render(
    createElement(MemoryRouter, { initialEntries: [route] }, createElement(element)),
  );

describe("PayMongo disclosure pages", () => {
  it.each(disclosure)("$route renders signed out", ({ route, title, page }) => {
    renderPublic(page, route);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it.each(disclosure)("$route discloses the merchant identity", ({ route, page }) => {
    renderPublic(page, route);
    expect(screen.getByText("Business address")).toBeInTheDocument();
    expect(screen.getByText("Registration number")).toBeInTheDocument();
    expect(screen.getAllByText(legalIdentity.support_email).length).toBeGreaterThan(0);
  });

  it.each(disclosure)("$route invents no registration number", ({ route, page }) => {
    const { container } = renderPublic(page, route);
    expect(container.textContent).not.toMatch(/\d{2}-\d{7}/);
  });

  it.each(disclosure)("$route links the other three policies", ({ route, title, page }) => {
    renderPublic(page, route);
    const nav = screen.getByRole("navigation", { name: "The other policies" });
    // The other three, and never a link back to the page you are already on.
    expect(within(nav).getAllByRole("link")).toHaveLength(disclosure.length - 1);
    expect(within(nav).queryByRole("link", { name: title })).toBeNull();
  });

  it("says a field is unpublished instead of filling it in", () => {
    renderPublic(Terms, "/terms");
    if (pendingIdentityField.length === 0) {
      expect(screen.queryByText(/Not yet published/)).toBeNull();
      return;
    }
    expect(screen.getAllByText(/Not yet published/).length).toBe(
      pendingIdentityField.length,
    );
  });
});

describe("legal identity data", () => {
  it("treats the placeholder vocabulary as unsupplied", () => {
    expect(isIdentityPending("TBD")).toBe(true);
    expect(isIdentityPending("")).toBe(true);
    expect(isIdentityPending("contact@advo.ph")).toBe(false);
  });
});

describe("landing footer", () => {
  it("reaches every disclosure from any page", () => {
    render(
      createElement(MemoryRouter, null, createElement(LandingFooter, { anchorPrefix: "/" })),
    );
    const nav = screen.getByRole("navigation", { name: "Legal" });
    disclosure.forEach(({ route, title }) => {
      expect(within(nav).getByRole("link", { name: title })).toHaveAttribute(
        "href",
        route,
      );
    });
  });
});
