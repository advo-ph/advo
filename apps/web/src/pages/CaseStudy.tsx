import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";
import { getCaseStudy } from "@/data/case-study";
import LandingShell from "@/components/landing/landing-shell";
import { Reveal, RevealGroup } from "@/components/motion/Reveal";

/**
 * One shipped system, in detail.
 *
 * The screenshot and the blurb come from the portfolio CMS, so the page cannot
 * show a client the site does not list. The feature breakdown comes from
 * `data/case-study.ts`, which was read out of the client's own repository
 * and cites the file behind every claim. A slug with a portfolio row but no
 * case study still renders; it just shows the shipped work without the
 * breakdown.
 */
const CaseStudy = () => {
  const { slug } = useParams<{ slug: string }>();
  const { project, isLoading } = usePortfolio();

  const entry = project.find((item) => item.slug === slug);
  const study = getCaseStudy(slug);

  useEffect(() => {
    if (entry) document.title = `${entry.title} — ADVO`;
    return () => {
      document.title = "ADVO. We digitalize it for you.";
    };
  }, [entry]);

  const live = entry?.live_url ?? study?.liveUrl ?? null;

  return (
    <LandingShell>
      <div className="landing-shell-main landing-case">
        <Link className="landing-case-back" to="/#work">
          <ArrowLeft size={15} />
          All work
        </Link>

        {isLoading ? null : !entry ? (
          <header className="landing-case-head">
            <h1>No such project</h1>
            <p>This case study is not in the portfolio.</p>
            <Link className="landing-button landing-button-primary" to="/#work">
              Back to the work
            </Link>
          </header>
        ) : (
          <>
            <Reveal as="header" className="landing-case-head">
              {study ? <small>{study.sector}</small> : null}
              <h1>{entry.title}</h1>
              <p>{study?.outcome ?? entry.blurb}</p>
              {live ? (
                <a className="landing-button landing-button-primary" href={live} target="_blank" rel="noopener noreferrer">
                  Visit the live site
                  <ArrowUpRight size={15} />
                </a>
              ) : null}
            </Reveal>

            {entry.screenshotUrl ? (
              <Reveal className="landing-still landing-case-shot" delay={0.1}>
                <img src={entry.screenshotUrl} alt={entry.title} />
              </Reveal>
            ) : null}

            {study ? (
              <>
                <Reveal className="landing-case-row">
                  <h2>Stack</h2>
                  <ul>
                    {study.stack.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Reveal>

                <div className="landing-case-row">
                  <Reveal as="h2">What we built</Reveal>
                  <RevealGroup className="landing-case-feature" stagger={0.06}>
                    {study.feature.map((item) => (
                      <Reveal as="article" key={item.name}>
                        <h3>{item.name}</h3>
                        <p>{item.detail}</p>
                        {/* The path is the citation. It is what separates this
                            page from a list of adjectives. */}
                        <code className="landing-case-proof">{item.proof}</code>
                      </Reveal>
                    ))}
                  </RevealGroup>
                </div>

                <Reveal className="landing-case-row">
                  <h2>Integrations</h2>
                  <ul className="is-single">
                    {study.integration.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Reveal>
              </>
            ) : (
              <p className="landing-case-row">A detailed breakdown of this build is not published yet.</p>
            )}

            <Reveal className="landing-case-cta">
              <h2>Want the same for your floor?</h2>
              <Link className="landing-button landing-button-primary" to="/start">
                Request a quotation
              </Link>
            </Reveal>
          </>
        )}
      </div>
    </LandingShell>
  );
};

export default CaseStudy;
