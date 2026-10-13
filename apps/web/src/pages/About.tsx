import { useQuery } from "@tanstack/react-query";
import StudioPage from "./StudioPage";
import { fetchTeam } from "@/hooks/useAdminTeam";
import { getResponsiveImageSrcSet } from "@/lib/image-urls";

export default function About() {
  const { data: roster = [], isLoading, error, refetch } = useQuery({ queryKey: ["publicTeam"], queryFn: fetchTeam, staleTime: 2 * 60 * 1000 });
  const members = roster.filter(member => member.is_active);
  return <StudioPage title="About ADVO" intro="A Philippine team building websites and systems that make everyday work easier." note={<><span>Founded</span><strong>January 29, 2026</strong></>}>
    <section className="studio-section studio-team-section"><h2>The people</h2>
      {isLoading ? <p role="status">Loading our team…</p> : error ? <div role="alert"><p>We couldn’t load the team.</p><button className="studio-text-link" onClick={() => void refetch()}>Try again</button></div> : members.length === 0 ? <p>Team profiles coming soon.</p> : <ul className="studio-people">{members.map(member => {
        const portrait = member.preview_image_url || member.avatar_url;
        return <li key={member.team_member_id}>
          <div className="studio-person-image">{portrait && !portrait.endsWith(".svg") ? <img src={portrait} srcSet={getResponsiveImageSrcSet(portrait)} sizes="80px" alt={member.name} loading="lazy" decoding="async" /> : <span aria-hidden="true">{member.name.charAt(0)}</span>}</div>
          <div><h3>{member.name}</h3><p className="studio-person-role">{member.role}</p>{member.bio && <p className="studio-person-bio">{member.bio}</p>}</div>
        </li>;
      })}</ul>}
    </section>
  </StudioPage>;
}
