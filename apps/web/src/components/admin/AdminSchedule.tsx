import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAdminDeliverables } from "@/hooks/useAdminDeliverables";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import { PageHeader } from "@/components/admin/_ui";
import { DeliverablesPanel } from "@/components/admin/shared/DeliverablesPanel";

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

const AdminSchedule = () => {
  const { activeMembers: teamMembers } = useAdminTeam();
  const { deliverables } = useAdminDeliverables();

  const [selectedMember, setSelectedMember] = useState<number | null>(null);

  const shownCount =
    selectedMember !== null
      ? deliverables.filter((d) => d.assigned_to === selectedMember).length
      : deliverables.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Work Items"
        meta={`${deliverables.length} total${selectedMember !== null ? ` · ${shownCount} shown` : ""}`}
      />

      {/* Team Member Filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedMember(null)}
          className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors ${
            selectedMember === null
              ? "bg-accent text-accent-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All members
        </button>
        {teamMembers.map((member) => (
          <button
            key={member.team_member_id}
            onClick={() => setSelectedMember(member.team_member_id)}
            className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium transition-colors ${
              selectedMember === member.team_member_id
                ? "bg-accent text-accent-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Avatar className="h-4 w-4">
              <AvatarImage src={member.avatar_url} />
              <AvatarFallback className="text-[9px]">
                {getInitials(member.name)}
              </AvatarFallback>
            </Avatar>
            {member.name.split(" ")[0]}
          </button>
        ))}
      </div>

      {/*
        No projectId = show all deliverables across all projects.
        hideProjectColumn=false keeps the Project column visible because
        the user is looking across multiple projects at once.
      */}
      <DeliverablesPanel
        hideProjectColumn={false}
        memberFilter={selectedMember ?? undefined}
      />
    </div>
  );
};

export default AdminSchedule;
