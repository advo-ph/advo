import { useEffect } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import LandingShell from "@/components/landing/landing-shell";
import { Reveal } from "@/components/motion/Reveal";
import "./how-it-ships.css";

const stages = [
  {
    id: "discovery",
    number: "01",
    title: "Start with the real problem.",
    image: "/landing/process/discover.jpg",
    imageAlt: "A team mapping out a project together",
    description:
      "We learn how the work happens today: who uses the system, where time gets lost, and what a better outcome would look like. That gives us a shared goal before we settle on a solution.",
    output: "A clear problem statement and the people it needs to serve.",
  },
  {
    id: "plan",
    number: "02",
    title: "Agree on the shape of the work.",
    image: "/landing/rw/plan.jpg",
    imageAlt: "A designer laying out the structure of a digital product",
    description:
      "We turn the goal into a practical scope: the key workflows, the first release, the systems it needs to connect to, and the decisions that can wait. You can see what is included before build work begins.",
    output: "Written scope, milestones, timeline, and price.",
  },
  {
    id: "design",
    number: "03",
    title: "Make the experience clear.",
    image: "/landing/process/design.jpg",
    imageAlt: "A working digital product taking shape",
    description:
      "We shape the screens and the path between them around the way your team works. We share the direction early, so questions about layout and flow are answered while they are still easy to change.",
    output: "A reviewed direction for the main screens and workflows.",
  },
  {
    id: "build",
    number: "04",
    title: "Build in visible steps.",
    image: "/landing/process/build.jpg",
    imageAlt: "A developer working on a product interface",
    description:
      "We build the agreed work in useful pieces and keep project updates, files, and decisions together in the Client Hub. When a preview is ready, you can see the work in context and share feedback against the scope.",
    output: "A working preview and a clear record of progress.",
  },
  {
    id: "review",
    number: "05",
    title: "Review, refine, and sign off.",
    image: "/landing/process/review.jpg",
    imageAlt: "A client reviewing a digital project before release",
    description:
      "We check the agreed workflows, test the experience across screen sizes, and gather feedback in one place. Requested changes are compared with the agreed scope, then we resolve the final issues and record sign-off.",
    output: "A tested release candidate and a documented sign-off.",
  },
  {
    id: "handoff",
    number: "06",
    title: "Launch with a clean handoff.",
    image: "/landing/process/support.jpg",
    imageAlt: "A team supporting a client after launch",
    description:
      "We deploy to the environment agreed for your project and walk through the finished system. If VPS hosting and ongoing support are part of the engagement, we cover the operating setup and support path too.",
    output: "The agreed deliverables, access, and next steps for support.",
  },
];

const HowItShips = () => {
  useEffect(() => {
    document.title = "How it ships — ADVO";
    return () => {
      document.title = "ADVO. We digitalize it for you.";
    };
  }, []);

  return (
    <LandingShell flowingBackground>
      <main className="landing-shell-main how-it-ships-page">
        <Reveal as="header" className="how-it-ships-hero">
          <div className="how-it-ships-heading">
            <p className="how-it-ships-kicker">How it ships</p>
            <h1>A clear plan, visible progress, and a clean handoff.</h1>
          </div>
          <div className="how-it-ships-intro">
            <p>
              We make the important decisions visible early: what we are solving,
              what is included, how the work is reviewed, and what happens at handoff.
            </p>
            <Link className="landing-button landing-button-primary" to="/start">
              Talk through your project
              <ArrowUpRight size={15} strokeWidth={1} absoluteStrokeWidth aria-hidden="true" />
            </Link>
          </div>
        </Reveal>

        <nav className="how-it-ships-index" aria-label="Project stages">
          {stages.map((stage, index) => (
            <a href={`#${stage.id}`} key={stage.id}>
              <span>{stage.number}</span>
              <span>{stage.title.replace(/[.!]$/, "")}</span>
              {index < stages.length - 1 ? <ArrowRight size={13} aria-hidden="true" /> : null}
            </a>
          ))}
        </nav>

        <ol className="how-it-ships-stages">
          {stages.map((stage) => (
            <li className="how-it-ships-stage" id={stage.id} key={stage.id}>
              <div className="how-it-ships-stage-number">{stage.number}</div>
              <div className="how-it-ships-stage-image">
                <img src={stage.image} alt={stage.imageAlt} loading="lazy" />
              </div>
              <div className="how-it-ships-stage-copy">
                <h2>{stage.title}</h2>
                <p>{stage.description}</p>
                <p className="how-it-ships-output">
                  <span>At this stage</span>
                  {stage.output}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <Reveal as="section" className="how-it-ships-next">
          <div>
            <p className="how-it-ships-kicker">Your next step</p>
            <h2>Bring us the part of work you want to make easier.</h2>
            <p>
              Tell us what is slowing the team down. We will help you work out
              whether a custom system is the right fit and what the first step could be.
            </p>
          </div>
          <Link className="landing-button landing-button-primary" to="/start">
            Start a project
            <ArrowUpRight size={15} strokeWidth={1} absoluteStrokeWidth aria-hidden="true" />
          </Link>
        </Reveal>
      </main>
    </LandingShell>
  );
};

export default HowItShips;
