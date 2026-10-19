import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  FreeMembersMeeting,
  FreeTimeDateRange,
} from "@/components/admin/AvailabilitySearchFields";

beforeAll(() => {
  // Radix scrolls the selected option into view; jsdom has no layout API.
  Element.prototype.scrollIntoView ??= vi.fn();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(cleanup);

async function selectTimePart(label: string, value: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: value }));
}

function clickDay(day: number) {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[name="day"]')
  ).find(
    (el) =>
      el.textContent === String(day) && !el.classList.contains("text-zinc-500")
  );
  expect(button).toBeTruthy();
  fireEvent.click(button!);
}

describe("availability search controls", () => {
  it("selects across months and commits both endpoints together", () => {
    const onChange = vi.fn();
    render(
      <FreeTimeDateRange
        start="2026-10-19"
        end="2026-11-02"
        minDate="2026-10-19"
        onChange={onChange}
      />
    );
    const trigger = screen.getByRole("button", { name: "Search date range" });
    fireEvent.click(trigger);
    clickDay(19);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Go to next month" }));
    clickDay(4);
    expect(onChange).toHaveBeenCalledWith({
      start: "2026-10-19",
      end: "2026-11-04",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("orders reversed endpoints and accepts a single-day range", () => {
    const onChange = vi.fn();
    render(
      <FreeTimeDateRange
        start="2026-10-19"
        end="2026-11-02"
        minDate="2026-10-19"
        onChange={onChange}
      />
    );
    const trigger = screen.getByRole("button", { name: "Search date range" });
    fireEvent.click(trigger);
    clickDay(25);
    clickDay(21);
    expect(onChange).toHaveBeenLastCalledWith({
      start: "2026-10-21",
      end: "2026-10-25",
    });
    fireEvent.click(trigger);
    clickDay(20);
    clickDay(20);
    expect(onChange).toHaveBeenLastCalledWith({
      start: "2026-10-20",
      end: "2026-10-20",
    });
  });

  it("sets the internal end date to the selected meeting date", () => {
    const onChange = vi.fn();
    render(
      <FreeMembersMeeting
        value={{
          startDate: "2026-10-19",
          endDate: "2026-10-19",
          startTime: "09:00",
          endTime: "10:00",
        }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Meeting date" }));
    clickDay(23);
    expect(onChange).toHaveBeenCalledWith({
      startDate: "2026-10-23",
      endDate: "2026-10-23",
      startTime: "09:00",
      endTime: "10:00",
    });
  });

  it("selects custom hours and minutes, toggles AM/PM, then dismisses with Escape", async () => {
    function Meeting() {
      const [value, onChange] = useState({
        startDate: "2026-10-19",
        endDate: "2026-10-19",
        startTime: "09:00",
        endTime: "10:00",
      });
      return <FreeMembersMeeting value={value} onChange={onChange} />;
    }
    render(<Meeting />);
    const trigger = screen.getByRole("button", { name: "Meeting time" });
    fireEvent.click(trigger);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(document.querySelector('select:not([aria-hidden="true"])')).toBeNull();
    await selectTimePart("Start time hour", "12");
    await selectTimePart("Start time minute", "07");
    expect(trigger).toHaveTextContent("12:07am – 10am");
    const startPeriod = screen.getByRole("button", { name: "Start time AM/PM" });
    fireEvent.click(startPeriod);
    expect(startPeriod).toHaveTextContent("PM");
    expect(startPeriod).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(startPeriod);
    expect(startPeriod).toHaveTextContent("AM");
    expect(trigger).toHaveTextContent("12:07am – 10am");
    fireEvent.click(startPeriod);
    await selectTimePart("End time hour", "01");
    await selectTimePart("End time minute", "59");
    fireEvent.click(screen.getByRole("button", { name: "End time AM/PM" }));
    expect(trigger).toHaveTextContent("12:07pm – 1:59pm");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "End time minute" }), { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
