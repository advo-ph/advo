import { motion } from "framer-motion";
import { GitCommit, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
      <div className="p-6 bg-card border border-border rounded-lg">
        <span className="font-mono text-sm text-muted-foreground">// Engineering Feed</span>
        <div className="mt-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-secondary rounded w-3/4 mb-2" />
              <div className="h-3 bg-secondary rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="p-6 bg-card border border-border rounded-lg">
        <span className="font-mono text-sm text-muted-foreground">// Engineering Feed</span>
        <div className="mt-8 text-center py-8">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
            <GitCommit className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Initializing Repository...</p>
          <p className="text-xs text-muted-foreground mt-1">Updates will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-card border border-border rounded-lg">
      <span className="font-mono text-sm text-muted-foreground">// Engineering Feed</span>
      
      <div className="mt-4 space-y-4">
        {updates.map((update, index) => (
          <motion.div
            key={update.progress_update_id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            className="relative pl-6 pb-4 border-l border-border last:pb-0"
          >
            {/* Timeline dot */}
            <div className="absolute left-0 top-0 w-3 h-3 -translate-x-1.5 rounded-full bg-accent" />
            
            {/* Content */}
            <div>
              <h4 className="text-sm font-medium mb-1">{update.update_title}</h4>
              {update.update_body && (
                <p className="text-xs text-muted-foreground mb-2">{update.update_body}</p>
              )}
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {update.commit_sha_reference && (
                  <span className="font-mono flex items-center gap-1">
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
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default EngineeringFeed;
