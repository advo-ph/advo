import StudioPage from "./StudioPage";

const stages = [
  ["Plan", "We agree on the scope, cost, and schedule."],
  ["Build", "You see progress and give feedback at agreed checkpoints."],
  ["Review", "We test the work, apply included revisions, and get your approval."],
  ["Launch", "We put it online and hand over the agreed access and support details."],
];
export default function ClientGuide() {
  return <StudioPage title="Client guide" intro="The essentials, before we start.">
    <section className="studio-section"><h2>The timeline</h2><div><ol className="studio-timeline">{stages.map(([title, text], i) => <li key={title}><span className="studio-step">0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol><p className="studio-footnote">Your proposal sets the dates for your project.</p></div></section>
    <section className="studio-section"><h2>What we need</h2><ul className="studio-list"><li>Your goals, must-have features, budget, and target date.</li><li>Your logo, photos, and content.</li><li>One person to give feedback and approve decisions.</li><li>Domain or service access, if needed.</li></ul></section>
    <section className="studio-section"><h2>What to expect</h2><p>Clear updates and agreed review rounds. Send feedback in one list. Extra features are quoted before we build them; hosting and support are agreed before launch.</p></section>
  </StudioPage>;
}
