const TECH = [
  { name: "React", slug: "react" },
  { name: "TypeScript", slug: "typescript" },
  { name: "Vite", slug: "vite" },
  { name: "Tailwind CSS", slug: "tailwindcss" },
  { name: "Node.js", slug: "nodedotjs" },
  { name: "Hono", slug: "hono" },
  { name: "Drizzle", slug: "drizzle" },
  { name: "PostgreSQL", slug: "postgresql" },
  { name: "Redis", slug: "redis" },
  { name: "Zod", slug: "zod" },
  { name: "Socket.IO", slug: "socketdotio" },
  { name: "Puppeteer", slug: "puppeteer" },
  { name: "Docker", slug: "docker" },
  { name: "Nginx", slug: "nginx" },
  { name: "Vercel", slug: "vercel" },
  { name: "Cloudflare", slug: "cloudflare" },
  { name: "GitHub", slug: "github" },
  { name: "Python", slug: "python" },
  { name: "Framer", slug: "framer" },
];

const Row = () => (
  <div className="flex shrink-0 animate-marquee items-center gap-16 pr-16">
    {TECH.map((t) => (
      <div
        key={t.slug}
        className="flex items-center gap-3 whitespace-nowrap"
        title={t.name}
      >
        <img
          src={`https://cdn.simpleicons.org/${t.slug}`}
          alt={t.name}
          className="h-8 w-8 md:h-10 md:w-10 opacity-90 hover:opacity-100 transition-opacity"
          loading="eager"
          decoding="async"
        />
        <span className="text-sm font-mono text-muted-foreground/50 tracking-wide">
          {t.name}
        </span>
      </div>
    ))}
  </div>
);

const TechTicker = () => {
  return (
    <section className="relative border-y border-border py-10 overflow-hidden bg-card/30">
      <div className="relative flex overflow-hidden">
        <Row />
        <Row />
      </div>

      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
    </section>
  );
};

export default TechTicker;
