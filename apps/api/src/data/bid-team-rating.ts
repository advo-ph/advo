/**
 * The team's own judgement on bids it has already read, keyed by PhilGEPS reference.
 *
 * Carried over from the hand-read list of 27 Oct 2026 (24 bids, every one read from
 * its notice; method in advoroads process/general-plans/references/
 * govt-bid-pipeline-27-10-26.md). The daily sync applies a row here as a `team`
 * rating, which the model never overwrites. `due` is the real bid deadline the team
 * read from the notice text; the sync keeps it only where it differs from PhilGEPS's
 * closing date (Bustos: papers close 6 Nov, bids are due 18 Nov).
 *
 * New judgements are made on the Bids page (PATCH /api/bids/:ref), not here.
 */
export type TeamRating = {
  win: "good" | "fair" | "low";
  kind: "product" | "software" | "hardware";
  shortTitle: string;
  shortBuyer: string;
  place: string;
  joinNote: string;
  whyNote: string;
  note?: string;
  due: { date: string; time: string };
};

export const TEAM_RATING: Record<string, TeamRating> = {
  "13299446": {"win":"good","kind":"product","shortTitle":"Emergency ICS and EOC platform software with environmental monitoring and forecasting","shortBuyer":"Southern Leyte province","place":"Maasin City, Southern Leyte","joinNote":"West Point may cover it; if not, a software partner (₱7.25M past job)","whyNote":"Almost exactly the FloodPASS console","due":{"date":"2026-11-12","time":"10:00 AM"}},
  "13307710": {"win":"good","kind":"product","shortTitle":"Early warning system and programs","shortBuyer":"Sagay City","place":"Negros Occidental","joinNote":"Yes, with West Point","whyNote":"Sensors and warnings are our core","due":{"date":"2026-11-17","time":"9:00 AM"}},
  "13301007": {"win":"good","kind":"product","shortTitle":"LGU disaster (DRRM) system: supply, install, deploy","shortBuyer":"Lal-lo","place":"Cagayan","joinNote":"West Point may cover it","whyNote":"Small job; our console fits; 60 days to deliver","due":{"date":"2026-11-10","time":"9:00 AM"}},
  "13303327": {"win":"good","kind":"software","shortTitle":"Residents (inhabitants) system for the barangay","shortBuyer":"Barangay Pulvorista, Kawit","place":"Cavite","joinNote":"Yes, ADVO alone (small consulting job)","whyNote":"Small, near, easy to build; only 7 days to deliver","due":{"date":"2026-11-10","time":"9:00 AM"}},
  "13306184": {"win":"fair","kind":"product","shortTitle":"Emergency operation and resource deployment system: AI chatbot, cloud, cybersecurity, command-centre equipment","shortBuyer":"Samar province","place":"Catbalogan City, Samar","joinNote":"Need a software partner (₱15.5M past job)","whyNote":"The biggest open bid that fits our console; far away, with a big hardware part","due":{"date":"2026-11-18","time":"9:00 AM"}},
  "13302320": {"win":"fair","kind":"product","shortTitle":"Hydromet sensors for the CDRRMO environmental monitoring and analytics system (CSJ-2026-188)","shortBuyer":"City of San Juan","place":"Metro Manila","joinNote":"Yes, with West Point; ask if its past job meets the \"within the preceding year\" rule","whyNote":"Our client city, but the spec may favour the supplier of its current system","note":"Bids open 12 Nov, 10:00 AM.","due":{"date":"2026-11-11","time":"4:00 PM"}},
  "13295647": {"win":"fair","kind":"product","shortTitle":"Flood water-level device with PA system, and a flood and landslide monitor","shortBuyer":"Hamtic","place":"Antique","joinNote":"Yes, with West Point","whyNote":"Small and far; 15 days to deliver","note":"Budget is in the notice text, not the budget field.","due":{"date":"2026-11-12","time":"10:30 AM"}},
  "13295187": {"win":"fair","kind":"product","shortTitle":"Water-level monitoring system and radio advisory system","shortBuyer":"Sogod","place":"Cebu","joinNote":"Yes, with West Point","whyNote":"Fits, but bids are due in one week","due":{"date":"2026-11-04","time":"10:00 AM"}},
  "13303860": {"win":"fair","kind":"product","shortTitle":"Command-centre upgrade: call handling, incident management, messaging, reporting and analytics","shortBuyer":"Bustos","place":"Bulacan","joinNote":"Need a software partner","whyNote":"Fits the console, but \"call handling licensing\" may favour one company","note":"Eligibility papers are due 6 Nov. The notice prints no budget.","due":{"date":"2026-11-18","time":"2:00 PM"}},
  "13298019": {"win":"fair","kind":"software","shortTitle":"AI-backed customer support solution","shortBuyer":"PHLPost","place":"Manila","joinNote":"Need a software partner (₱3.5M past job)","whyNote":"We can build it; big customer-service firms will bid too","due":{"date":"2026-11-19","time":"9:00 AM"}},
  "13304003": {"win":"fair","kind":"software","shortTitle":"Learning management system for 8,000 students (Talibon Polytechnic College)","shortBuyer":"Talibon","place":"Bohol","joinNote":"Need a software partner (₱2.5M past job)","whyNote":"Cheap school-software resellers compete; far away","due":{"date":"2026-11-16","time":"10:00 AM"}},
  "13295395": {"win":"fair","kind":"software","shortTitle":"Smart attendance and HRIS system","shortBuyer":"Tanauan City","place":"Batangas","joinNote":"Need a software partner (₱1.5M past job)","whyNote":"Near; HR software sellers compete","due":{"date":"2026-11-09","time":"10:00 AM"}},
  "13307772": {"win":"fair","kind":"software","shortTitle":"Cloud health-records (EMR) subscription for health staff","shortBuyer":"San Jose del Monte","place":"Bulacan","joinNote":"Yes, ADVO alone (small value buy)","whyNote":"May be tied to the records app they already use","due":{"date":"2026-11-03","time":"12:00 PM"}},
  "13307494": {"win":"fair","kind":"hardware","shortTitle":"CCTV command centre and smart city monitoring solution","shortBuyer":"San Miguel","place":"Bulacan","joinNote":"Need a CCTV partner","whyNote":"Near and has a software part; cameras are most of the cost","due":{"date":"2026-11-16","time":"1:00 PM"}},
  "13300376": {"win":"low","kind":"software","shortTitle":"Mandaue resident ID system","shortBuyer":"Mandaue City","place":"Cebu","joinNote":"Need an ID card partner (₱15M past job)","whyNote":"ID card companies own this market","due":{"date":"2026-11-17","time":"9:00 AM"}},
  "13301691": {"win":"low","kind":"software","shortTitle":"Consultancy: groundwater information system and telemetry (phase 1)","shortBuyer":"NWRB","place":"Quezon City","joinNote":"Need a consulting firm with water experts","whyNote":"Needs hydrogeologists we do not have","due":{"date":"2026-11-26","time":"12:00 PM"}},
  "13306619": {"win":"low","kind":"software","shortTitle":"Electronic tax maps for 19 towns (consulting, expression of interest)","shortBuyer":"La Union province","place":"San Fernando, La Union","joinNote":"Consulting shortlist on past tax-map work","whyNote":"Needs a past tax-map job","due":{"date":"2026-11-03","time":"10:00 AM"}},
  "13302260": {"win":"low","kind":"product","shortTitle":"Early warning system: design, poles, signal, commissioning, training","shortBuyer":"Davao del Sur province","place":"Digos City","joinNote":"Yes, with West Point","whyNote":"Mostly poles and radio work","due":{"date":"2026-11-10","time":"9:00 AM"}},
  "13306647": {"win":"low","kind":"hardware","shortTitle":"Advanced smart drone system with equipment","shortBuyer":"Quezon City (Building Official)","place":"Metro Manila","joinNote":"Need a drone dealer","whyNote":"Dealers win on price","due":{"date":"2026-11-20","time":"9:30 AM"}},
  "13304391": {"win":"low","kind":"hardware","shortTitle":"Outdoor LED wall for live weather and early warnings (20 panels, 4 mm)","shortBuyer":"Laguna province","place":"Sta. Cruz, Laguna","joinNote":"Need an LED supplier","whyNote":"Judged on panels and price; our live feed earns no points","due":{"date":"2026-11-17","time":"10:00 AM"}},
  "13289741": {"win":"low","kind":"hardware","shortTitle":"Projection mapping materials and equipment, TLC Park","shortBuyer":"Taguig","place":"Metro Manila","joinNote":"Need an AV partner","whyNote":"Needs a similar job from the last 3 years","due":{"date":"2026-11-03","time":"as posted"}},
  "13308822": {"win":"low","kind":"hardware","shortTitle":"Traffic signal components in various intersections","shortBuyer":"Davao City (CTTMO)","place":"Davao City","joinNote":"Need a traffic-signal partner","whyNote":"Parts supply only","due":{"date":"2026-11-17","time":"12:01 PM"}},
  "13299863": {"win":"low","kind":"hardware","shortTitle":"Enterprise RTK drone with long-range LiDAR mapping system","shortBuyer":"Mandaue City","place":"Cebu","joinNote":"Need a drone dealer","whyNote":"Dealers win on price","due":{"date":"2026-11-17","time":"9:00 AM"}},
  "13308060": {"win":"low","kind":"hardware","shortTitle":"Traffic signal system at one junction","shortBuyer":"Maasin City","place":"Southern Leyte","joinNote":"Need a traffic-signal partner","whyNote":"Hardware job","due":{"date":"2026-11-17","time":"9:30 AM"}},
};

/** Bids the team ruled out by hand, with the reason the rules and the model cannot see. */
export const TEAM_NOT_FIT: Record<string, string> = {
  // COMELEC online voting and counting system, 2028 overseas, ₱452M.
  "13240459": "The law wants a system already used in an election (RA 9369 §12)",
};
