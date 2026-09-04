import { cn } from "@/lib/utils";

interface TeamMemberCardProps {
  name: string;
  role: string;
  avatar_url: string | null;
  preview_image_url?: string | null;
  className?: string;
}

const TeamMemberCard = ({ name, role, avatar_url, preview_image_url, className }: TeamMemberCardProps) => {
  const cardImage = preview_image_url || avatar_url;
  return (
  <div className={cn("group relative overflow-hidden rounded-2xl border border-border bg-card aspect-[3/4]", className)}>
    <div className="absolute inset-0">
      {cardImage ? (
        <img
          src={cardImage}
          alt={name}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-7xl font-semibold text-muted-foreground/10 bg-secondary">
          {name.charAt(0)}
        </div>
      )}
    </div>

    <div className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-t from-black/90 to-transparent" />

    <div className="absolute inset-x-0 bottom-0 px-6 pb-6">
      <h3 className="text-2xl font-bold tracking-[-0.025em] leading-tight text-white">
        {name}
      </h3>
      <p className="mt-1 text-[13px] font-normal uppercase tracking-[0.01em] leading-tight text-white">
        {role}
      </p>
    </div>
  </div>
  );
};

export default TeamMemberCard;
