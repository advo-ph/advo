import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Index from "@/pages/Index";

vi.mock("@/components/landing/LandingPage", () => ({
  default: () => <div>Public landing page</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { role: "client" },
  }),
}));

describe("root route", () => {
  it("keeps the public landing page visible for an authenticated user", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Index />
      </MemoryRouter>,
    );

    expect(screen.getByText("Public landing page")).toBeInTheDocument();
  });
});
