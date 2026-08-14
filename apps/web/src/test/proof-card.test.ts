/**
 * getProof() fallbacks — render-tree coverage for PortfolioCard.
 *
 * getProof is module-private; these tests exercise each fallback by
 * rendering the card (no image → ProofMock shows before/after).
 */
import { createElement, type ComponentProps, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PortfolioCard from "@/components/landing/PortfolioCard";

vi.mock("@/components/motion/Reveal", () => ({
  Reveal: ({
    children,
    as: Tag = "div",
    className,
  }: {
    children: ReactNode;
    as?: keyof HTMLElementTagNameMap;
    className?: string;
  }) => createElement(Tag, { className }, children),
}));

function renderCard(
  prop: Partial<ComponentProps<typeof PortfolioCard>> & { title: string },
) {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(PortfolioCard, { description: "", techStack: [], ...prop }),
    ),
  );
}

describe("getProof fallbacks", () => {
  it("uses title / generic copy / fallback products when case study is missing", () => {
    renderCard({ title: "Empty Proof Co", description: "" });

    expect(screen.getByText("A public proof card for Empty Proof Co.")).toBeInTheDocument();
    expect(screen.getByText("Built for launch")).toBeInTheDocument();
    expect(screen.getByText("Website")).toBeInTheDocument();
    expect(screen.getByText("Client Hub")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Manual workflow")).toBeInTheDocument();
    expect(screen.getByText("Connected system")).toBeInTheDocument();
  });

  it("prefers description for outcome and techStack for products", () => {
    renderCard({
      title: "Stack Co",
      description: "Replaced a spreadsheet checkout.",
      techStack: ["React", "Hono", "Postgres"],
    });

    expect(screen.getByText("Replaced a spreadsheet checkout.")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Hono")).toBeInTheDocument();
    expect(screen.getByText("Postgres")).toBeInTheDocument();
    expect(screen.queryByText("Website")).not.toBeInTheDocument();
  });

  it("reads camelCase case-study fields over generic fallbacks", () => {
    renderCard({
      title: "Camel Case Co",
      description: "unused description",
      techStack: ["ShouldNotShow"],
      caseStudy: {
        outcome: "Cut invoice time in half.",
        timeline: "Six weeks",
        productsUsed: ["Hub", "Billing"],
        beforeAfter: { before: "Paper invoices", after: "Hub invoices" },
        results: ["Paid on time", "Fewer chases"],
      },
    });

    expect(screen.getByText("Cut invoice time in half.")).toBeInTheDocument();
    expect(screen.getByText("Six weeks")).toBeInTheDocument();
    expect(screen.getByText("Hub")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Paper invoices")).toBeInTheDocument();
    expect(screen.getByText("Hub invoices")).toBeInTheDocument();
    expect(screen.getByText("Paid on time")).toBeInTheDocument();
    expect(screen.getByText("Fewer chases")).toBeInTheDocument();
    expect(screen.queryByText("ShouldNotShow")).not.toBeInTheDocument();
  });

  it("reads snake_case aliases and overview / challenge / solution fallbacks", () => {
    renderCard({
      title: "Snake Case Co",
      description: "unused description",
      caseStudy: {
        overview: "A clinic front desk, online.",
        challenge: "Walk-in only",
        solution: "Booking link",
        timeline: "One month",
        products_used: ["Website", "Hub"],
        results: ["Booked same week"],
      },
    });

    expect(screen.getByText("A clinic front desk, online.")).toBeInTheDocument();
    expect(screen.getByText("Walk-in only")).toBeInTheDocument();
    expect(screen.getByText("Booking link")).toBeInTheDocument();
    expect(screen.getByText("One month")).toBeInTheDocument();
    expect(screen.getByText("Website")).toBeInTheDocument();
    expect(screen.getByText("Hub")).toBeInTheDocument();
    expect(screen.getByText("Booked same week")).toBeInTheDocument();
    expect(screen.queryByText("Client Hub")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });
});
