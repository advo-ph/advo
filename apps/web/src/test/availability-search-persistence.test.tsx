import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminAvailability from "@/components/admin/AdminAvailability";

vi.mock("@/hooks/useAdminTeam", () => ({
  useAdminTeam: () => ({ members: [
    { team_member_id: 1, name: "Alex", is_active: true },
    { team_member_id: 2, name: "Sam", is_active: true },
  ], isLoading: false }),
  publicSiteOrder: (members: unknown[]) => members,
}));
vi.mock("@/hooks/useAdminAvailability", () => ({
  useAdminAvailability: () => ({ blocks: [], isLoading: false }),
}));
vi.mock("@/hooks/useCalendar", () => ({
  useCalendar: () => ({ events: [], isLoading: false }),
}));
vi.mock("@/hooks/useRoles", () => ({
  useRoles: () => ({ teamMemberId: 1, isLoading: false }),
}));
vi.mock("@/components/admin/shared/ResponsiveSheet", () => ({
  ResponsiveSheet: ({ open, onOpenChange, children }: {
    open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode;
  }) => open ? <div><button onClick={() => onOpenChange(false)}>Close search</button>{children}</div> : null,
}));
// Exercise the popup's state through controlled fields; picker mechanics have their own suite.
vi.mock("@/components/admin/AvailabilitySearchFields", () => ({
  FreeTimeDateRange: ({ start, end, onChange }: {
    start: string; end: string; onChange: (range: { start: string; end: string }) => void;
  }) => <>
    <input aria-label="Search start" value={start} onChange={(e) => onChange({ start: e.target.value, end })} />
    <input aria-label="Search end" value={end} onChange={(e) => onChange({ start, end: e.target.value })} />
  </>,
  FreeMembersMeeting: ({ value, onChange }: {
    value: { startDate: string; endDate: string; startTime: string; endTime: string };
    onChange: (value: typeof value) => void;
  }) => <>
    <input aria-label="Meeting date" value={value.startDate} onChange={(e) => onChange({ ...value, startDate: e.target.value, endDate: e.target.value })} />
    <input aria-label="Start time" value={value.startTime} onChange={(e) => onChange({ ...value, startTime: e.target.value })} />
    <input aria-label="End time" value={value.endTime} onChange={(e) => onChange({ ...value, endTime: e.target.value })} />
  </>,
}));

const open = () => fireEvent.click(screen.getByRole("button", { name: /Free time Find free time/i }));
const close = () => fireEvent.click(screen.getByRole("button", { name: "Close search" }));
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T10:00:00+08:00"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("availability popup persistence", () => {
  it("keeps dates, people, times and mode across closing and reopening", () => {
    render(<AdminAvailability />);
    open();
    change("Search start", "2026-10-21");
    change("Search end", "2026-11-04");
    fireEvent.click(screen.getByTestId("freetime-member-2"));
    close(); open();
    expect(screen.getByLabelText("Search start")).toHaveValue("2026-10-21");
    expect(screen.getByLabelText("Search end")).toHaveValue("2026-11-04");
    expect(screen.getByTestId("freetime-member-1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("freetime-member-2")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByTestId("freetime-member-1"));
    close(); open();
    expect(screen.getByTestId("freetime-member-1")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("freetime-member-2")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByTestId("freetime-mode-members"));
    change("Meeting date", "2026-10-21");
    change("Start time", "08:07");
    change("End time", "09:59");
    close(); open();
    expect(screen.getByTestId("freetime-mode-members")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Meeting date")).toHaveValue("2026-10-21");
    expect(screen.getByLabelText("Start time")).toHaveValue("08:07");
    expect(screen.getByLabelText("End time")).toHaveValue("09:59");
    close();
    vi.setSystemTime(new Date("2026-10-22T00:01:00+08:00"));
    open();
    expect(screen.getByLabelText("Meeting date")).toHaveValue("2026-10-22");
    expect(screen.getByLabelText("Start time")).toHaveValue("08:07");
    expect(screen.getByLabelText("End time")).toHaveValue("09:59");
    fireEvent.click(screen.getByTestId("freetime-mode-time"));
    expect(screen.getByLabelText("Search start")).toHaveValue("2026-10-22");
    expect(screen.getByLabelText("Search end")).toHaveValue("2026-11-04");
    expect(screen.getByTestId("freetime-member-2")).toHaveAttribute("aria-pressed", "false");
  });
});
