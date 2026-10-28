/**
 * The Bids page's background: how public bids are won, who we partner with, the papers
 * each bidder needs, and where the big money went. Moved here from the FloodPASS repo's
 * old /bids page (27 Oct 2026); method and sources in advoroads
 * process/general-plans/references/govt-bid-pipeline-27-10-26.md.
 *
 * Static on purpose: this changes when we learn something, not when PhilGEPS does. The
 * bids themselves come from the API (GET /api/bids), refreshed every morning.
 */

export const RULES: string[] = [
  "Every bid is a pass/fail papers check, then the lowest price wins. Extra features earn no points.",
  "We win where the bid asks for something we already built, because then we can price low.",
  "To pass the papers check you need one finished, similar contract worth half the budget. A partner's contract counts for the whole joint venture.",
  "Each joint-venture partner needs its own PhilGEPS registration.",
  "Small value buys (under ₱2M) usually ask only for papers, not a past contract. Check each notice.",
  "Missing a pre-bid meeting usually does not disqualify you. Going is still how you learn what the buyer really wants.",
];

export const PARTNERS: { name: string; covers: string; record: string }[] = [
  {
    name: "West Point Engineering Supplies",
    covers: "Sensor, early warning and telemetry bids",
    record:
      "La Union telemetry ₱39.8M (2024), DPWH hydrological equipment ₱36.97M (2022), NIA water-level sensors ₱20.3M (2023). Get each notice of award and certificate of acceptance.",
  },
  {
    name: "A software partner (none yet)",
    covers: "Software bids that need a past software contract",
    record: "Needs one finished software contract worth half the budget. ADVO's own finished private client jobs may count instead.",
  },
];

export const PAPERS: string[] = [
  "PhilGEPS registration (Platinum for public bidding)",
  "DTI registration, mayor's permit, BIR registration and tax clearance",
  "Latest audited financial statements",
  "Statement of ongoing and completed contracts, with the one similar contract",
  "Net financial contracting capacity, or a committed bank credit line of 10% of the budget",
  "Bid Securing Declaration (or a bid security)",
  "Joint venture agreement, notarised, when bidding with a partner",
  "Omnibus Sworn Statement",
];

/**
 * The biggest past awards in our kind of work, 2023–2025 (PhilGEPS awards via the
 * BetterGov mirror). `value` is pesos, only for sorting; `amount` is what is shown.
 */
export const PAST_BIG: { buyer: string; what: string; amount: string; value: number; winner: string }[] = [
  { buyer: "PCSO", what: "Web betting platform, 5-year lease", amount: "₱4.09B", value: 4_090_000_000, winner: "Pacific Online" },
  { buyer: "MSU Naawan", what: "Smart campus information systems", amount: "₱1.50B", value: 1_500_000_000, winner: "Lancaster Technology" },
  { buyer: "Bicol University", what: "Smart campus cybersecurity platform", amount: "₱848M", value: 848_000_000, winner: "Centurion Digital" },
  { buyer: "Angeles City", what: "Command centre", amount: "₱648.5M", value: 648_500_000, winner: "ComClark" },
  { buyer: "MMDA", what: "Smart City Package I (EDSA)", amount: "₱374.9M", value: 374_900_000, winner: "Net Pacific" },
  { buyer: "DICT", what: "AWS cloud for eGov", amount: "₱370M", value: 370_000_000, winner: "Radenta" },
  { buyer: "Landbank", what: "HRIS replacement", amount: "₱229M", value: 229_000_000, winner: "Cosmotech" },
  { buyer: "PAGASA", what: "S-band weather radar (each)", amount: "₱177–199M", value: 177_000_000, winner: "State Alliance, EECSI" },
  { buyer: "MMDA", what: "Smart City Package 2 (traffic data)", amount: "₱141.9M", value: 141_900_000, winner: "Cylix" },
  { buyer: "Butuan City", what: "DRRM command centre ICT", amount: "₱131.8M", value: 131_800_000, winner: "EVI Distribution" },
  { buyer: "Makati", what: "Digitisation and document management", amount: "₱105.4M", value: 105_400_000, winner: "iBayad Online" },
  { buyer: "MMDA", what: "NCR Communication and Command Center", amount: "₱100M", value: 100_000_000, winner: "Infobahn" },
  { buyer: "Quezon City", what: "11 DRRMO contracts (sensors, alerts, yearly renewal)", amount: "₱195.9M total", value: 195_900_000, winner: "QUEAY, Komunidad" },
  { buyer: "Makati", what: "Water-level sensors, 2023 and 2024", amount: "₱64.7M each", value: 64_700_000, winner: "Boston Home" },
];
