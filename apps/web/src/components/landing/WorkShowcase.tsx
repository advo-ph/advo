import type { ShippedProject } from "@/hooks/usePortfolio";
import { caseStudy } from "@/data/case-study";
import {
  CaseStudyFlipStack,
  type CaseStudyFlipItem,
} from "@/components/ui/case-study-flip-stack";

/**
 * The live portfolio captures span 1.728:1 to 2.009:1. Four of the six sit
 * around 1.76:1, so use that measured common ratio through the flip stack,
 * including on phones. That keeps the screenshot landscape without forcing
 * every project into the stock component's portrait mobile card.
 */
const WORK_IMAGE_RATIO = "1.76 / 1";

const CASE_STUDY_COLORS = [
  { background: "#a94808", foreground: "#fff7ed" },
  { background: "#067b8f", foreground: "#ecfeff" },
  { background: "#3d6446", foreground: "#f2faef" },
  { background: "#4d3b78", foreground: "#f5f1ff" },
  { background: "#8f4438", foreground: "#fff4f1" },
  { background: "#46566f", foreground: "#f1f5ff" },
];

function getEyebrow(project: ShippedProject) {
  const sector = project.slug ? caseStudy[project.slug]?.sector : undefined;
  return sector?.split(" · ")[0] ?? "Digital product";
}

function toCaseStudyItem(project: ShippedProject, index: number): CaseStudyFlipItem {
  const colors = CASE_STUDY_COLORS[index % CASE_STUDY_COLORS.length];

  return {
    number: String(index + 1).padStart(2, "0"),
    eyebrow: getEyebrow(project),
    title: project.title,
    description:
      project.blurb || "A digital experience built around the people it serves.",
    image: project.screenshotUrl ?? "",
    imageAlt: `${project.title} website screenshot`,
    background: colors.background,
    foreground: colors.foreground,
  };
}

interface WorkShowcaseProps {
  project: ShippedProject[];
}

const WorkShowcase = ({ project }: WorkShowcaseProps) => {
  if (project.length === 0) return null;

  const items = project.map(toCaseStudyItem);

  return (
    <section
      id="work"
      className="work-v2"
      aria-label="Our projects — selected work we have shipped"
      style={{ ["--work-image-ratio" as string]: WORK_IMAGE_RATIO }}
    >
      <CaseStudyFlipStack
        items={items}
        hint="Scroll to explore"
        heading="Design That Delivers."
        endLabel="The End"
        className="work-v2-stack"
      />
    </section>
  );
};

export default WorkShowcase;
