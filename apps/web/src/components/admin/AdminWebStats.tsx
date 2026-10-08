/**
 * Web statistics — visitor numbers for the public site.
 *
 * Holds the nav slot for the visitor analytics surface described in
 * process/general-plans/active/visitor-analytics_PLAN_09-10-26.md. Until that
 * ships there is no data to read, so this renders an empty state.
 */
import { BarChart3 } from "lucide-react";
import { PageHeader, Empty } from "@/components/admin/_ui";

const AdminWebStats = () => (
  <div className="space-y-4">
    <PageHeader title="Web Statistics" meta="Public site visitors" />
    <Empty text="No visitor data yet" icon={BarChart3} />
  </div>
);

export default AdminWebStats;
