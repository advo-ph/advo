import { GitCommit, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Panel, Empty } from "@/components/admin/_ui";

interface Update {
  progress_update_id: number;
  update_title: string;
  update_body?: string;
  commit_sha_reference?: string;
  created_at: string;
}

interface EngineeringFeedProps {
  updates: Update[];
  isLoading?: boolean;
}

const EngineeringFeed = ({ updates, isLoading }: EngineeringFeedProps) => {
  if (isLoading) {
    return (
      <Panel title="Engineering feed">
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-secondary rounded w-3/4 mb-2" />
              <div className="h-3 bg-secondary rounded w-1/2" />
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  if (updates.length === 0) {
    return (
      <Panel title="Engineering feed">
        <Empty text="Updates will appear here" />
      </Panel>
    );
  }

  return (
    <Panel title="Engineering feed">
      <div className="divide-y divide-border">
        {updates.map((update) => (
          <div key={update.progress_update_id} className="px-4 py-3">
            <h4 className="text-sm font-medium mb-1">{update.update_title}</h4>
            {update.update_body && (
              <p className="text-xs text-muted-foreground mb-2 leading-snug">
                {update.update_body}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {update.commit_sha_reference && (
                <span className="flex items-center gap-1 tabular-nums">
                  <GitCommit className="h-3 w-3" />
                  {update.commit_sha_reference.slice(0, 7)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
};

export default EngineeringFeed;
