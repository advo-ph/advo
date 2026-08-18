/**
 * Mobile nav drawer (FloatingNav) — behaviour that was previously only ever
 * checked by hand on a phone: Escape closes it, the body scrolls nowhere while
 * it is open, and a route change closes it instead of leaving it stuck over
 * the new page.
 */
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FloatingNav from "@/components/landing/FloatingNav";

/** Navigates without touching the drawer, so the route-change close is isolated. */
const RouteProbe = () => {
  const navigate = useNavigate();
  return createElement(
    "button",
    { type: "button", onClick: () => navigate("/team") },
    "go elsewhere",
  );
};

const renderNav = () =>
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/"] },
      createElement(FloatingNav),
      createElement(RouteProbe),
    ),
  );

const openDrawer = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  return screen.findByRole("dialog", { name: "Mobile navigation" });
};

const expectDrawerClosed = () =>
  waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Mobile navigation" })).toBeNull(),
  );

describe("mobile nav drawer", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("opens from the toggle and reports its state to assistive tech", async () => {
    renderNav();
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    const drawer = await openDrawer();
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("closes on Escape", async () => {
    renderNav();
    await openDrawer();

    fireEvent.keyDown(window, { key: "Escape" });

    await expectDrawerClosed();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("ignores other keys", async () => {
    renderNav();
    await openDrawer();

    fireEvent.keyDown(window, { key: "a" });

    expect(screen.getByRole("dialog", { name: "Mobile navigation" })).toBeInTheDocument();
  });

  it("locks body scroll while open and restores the previous value on close", async () => {
    document.body.style.overflow = "auto";
    renderNav();

    await openDrawer();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(document.body.style.overflow).toBe("auto"));
  });

  it("closes on a route change it did not initiate", async () => {
    renderNav();
    await openDrawer();

    fireEvent.click(screen.getByRole("button", { name: "go elsewhere" }));

    await expectDrawerClosed();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes when a drawer link navigates away", async () => {
    renderNav();
    await openDrawer();

    fireEvent.click(screen.getByRole("link", { name: /Start a Project/i }));

    await expectDrawerClosed();
  });
});
