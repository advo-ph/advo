import { motion } from "framer-motion";
import { FolderKanban, Users, Inbox, DollarSign, TrendingUp, Activity, Calendar } from "lucide-react";
import type { RecentActivity, UpcomingDeadline } from "@/types/admin";

interface AdminDashboardProps {
  projectCount: number;
  clientCount: number;
  leadCount: number;
  totalRevenue: number;
  formatCurrency: (cents: number) => string;
  recentActivity: RecentActivity[];
  upcomingDeadlines: UpcomingDeadline[];
}

const AdminDashboard = ({
  projectCount,
  clientCount,
  leadCount,
  totalRevenue,
  formatCurrency,
  recentActivity,
  upcomingDeadlines,
}: AdminDashboardProps) => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your agency operations</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="p-6 bg-card border border-border rounded-xl shadow-card"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Active Projects</span>
            <FolderKanban className="h-5 w-5 text-accent" />
          </div>
          <p className="text-3xl font-bold mt-2">{projectCount}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span className="text-green-500">Active</span>
            <span>projects</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-6 bg-card border border-border rounded-xl shadow-card"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Clients</span>
            <Users className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold mt-2">{clientCount}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" />
            <span>All active</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 bg-card border border-border rounded-xl shadow-card"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">New Leads</span>
            <Inbox className="h-5 w-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold mt-2">{leadCount}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <span>Pending review</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-6 bg-card border border-border rounded-xl shadow-card"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Revenue</span>
            <DollarSign className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold mt-2">{formatCurrency(totalRevenue)}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span className="text-green-500">Collected</span>
            <span>to date</span>
          </div>
        </motion.div>
      </div>

      {/* Quick Actions / Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="p-6 bg-card border border-border rounded-xl shadow-card">
          <h3 className="font-semibold mb-4">Recent Activity</h3>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No recent activity yet</p>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((activity, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent mt-2" />
                  <div className="flex-1">
                    <p className="text-sm">{activity.action}</p>
                    <p className="text-xs text-muted-foreground">{activity.target} • {activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Deadlines */}
        <div className="p-6 bg-card border border-border rounded-xl shadow-card">
          <h3 className="font-semibold mb-4">Upcoming Deadlines</h3>
          {upcomingDeadlines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No upcoming deadlines</p>
          ) : (
            <div className="space-y-4">
              {upcomingDeadlines.map((deadline) => (
                <div key={deadline.deliverable_id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{deadline.title}</p>
                    <p className="text-xs text-muted-foreground">{deadline.project_title}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${
                    deadline.is_urgent
                      ? "bg-red-500/10 text-red-500"
                      : "bg-secondary text-muted-foreground"
                  }`}>
                    <Calendar className="h-3 w-3" />
                    {deadline.due_date
                      ? new Date(deadline.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "No date"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
