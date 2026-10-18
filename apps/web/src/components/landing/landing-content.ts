/**
 * The landing page copy that is plain data: the industries and what we sell into
 * each, the services chapters, and the client marks. It lives here, not in the
 * components, so the search build (src/seo, scripts/prerender.mjs) reads the same
 * words visitors see. Change the copy here and both stay in step.
 */

export const heroHeading = "We digitalize it for you.";
export const heroCopy = "Our vision is to build the technological infrastructure for industries across the Philippines.";

/**
 * What ADVO builds, by industry, each with the products we actually sell into it.
 * Prince, 09-03: this reads to a restaurant or a clinic owner as "yes, they have
 * built the thing I need", where "Strategy / Design / Development" never does.
 */
export interface Offer {
  name: string;
  copy: string;
}
export interface Industry {
  key: string;
  image: string;
  title: string;
  heading: string;
  copy: string;
  offer: Offer[];
  href?: string;
}
export const industry: Industry[] = [
  {
    key: "flood",
    image: "/landing/industry/flood.webp",
    title: "Flood",
    heading: "Know flooded roads in real-time",
    copy: "Navigational map of real-time flooded roads",
    offer: [
      {
        name: "Live flood depth measurements",
        copy: "Track floods with street sensors, PAGASA gauges, rainfall and flood hazard data.",
      },
      {
        name: "Navigation avoids flooded areas",
        copy: "The app gives directions to safer routes to avoid flooded roads.",
      },
      { name: "Shared operational view", copy: "Provide LGUs live data for faster coordination and rescues." },
    ],
    href: "https://floodpass.com",
  },
  {
    key: "education",
    image: "/landing/industry/education.webp",
    title: "School",
    heading: "A safer, more connected campus.",
    copy: "Campus access, safety, and school operations in one system.",
    offer: [
      { name: "ID authentication", copy: "Student IDs tap in at gates, integrated with attendance monitoring." },
      { name: "Safety and Security", copy: "Turnstile tap ID entrance and exit with industry-grade baggage scanning." },
      { name: "Dedicated website and app", copy: "A dedicated website and app for the institution and its students." },
    ],
  },
  {
    key: "parking",
    image: "/landing/industry/parking.webp",
    title: "Parking",
    heading: "A convenient parking experience.",
    copy: "A fully automated car park for drivers, managers, and owners.",
    offer: [
      {
        name: "Ticketless system",
        copy: "Entrance and exit automatically open by scanning the license plate.",
      },
      { name: "Self-service payment", copy: "Pay at the kiosk, or scan the QR to pay using your phone" },
      { name: "Find my car", copy: "Locate your parking spot through the app" },
    ],
    href: "https://park.advo.ph",
  },
  {
    key: "medical",
    image: "/landing/industry/medical.webp",
    title: "Medical",
    heading: "Connected care for clinics, labs, and pharmacies.",
    copy: "Clinic management system with EMR for appointments, queueing, billing, inventory, and integration.",
    offer: [
      { name: "Clinic operations", copy: "Manage appointments, queueing, billing, and stock." },
      { name: "Electronic medical records", copy: "Give doctors EMR tools for patient records." },
      { name: "Hospital integration", copy: "Connect care systems without relying on fax machines." },
    ],
  },
];

export interface IndustryTab {
  title: string;
  heading: string;
  copy: string;
  still: string;
  offer?: Offer[];
  href?: string;
}

export const industryTab: IndustryTab[] = [
  {
    title: "Food",
    heading: "Restaurants, cafes, and food stalls",
    copy: "QR code ordering from the table, kiosk ordering with payment, and table management for seating, waitlists, and turn times.",
    still: "/landing/industry/food.webp",
  },
  {
    title: "Medical",
    heading: "Clinics, labs, and pharmacies",
    copy: "Clinic management system with EMR for appointments, queueing, billing, inventory, and integration.",
    still: "/landing/industry/medical.webp",
  },
  {
    // Construction still is a stand-in until a real photo lands in
    // apps/web/public/landing/industry/construction.jpg
    title: "Construction",
    heading: "Contractors and developers",
    copy: "Site progress and manpower tracking, delivery coordination, and progress billing in one system.",
    still: "/landing/hero-building.webp",
  },
  {
    title: "Business",
    heading: "Offices, retail, and services",
    copy: "Inventory and point of sale; scheduling and customer records; fleet tracking, dispatch, and proof of delivery.",
    still: "/landing/industry/business.webp",
  },
];

export const marqueeLogos = [
  // The stacked VBE lockup hits the height cap first; match its wordmark width
  // to FourlinQ rather than giving both images the same bounding-box scale.
  { src: "/landing/logo/vbe-eye-center.png", alt: "VBE Eye Center", scale: 1.55, width: 315, height: 155 },
  { src: "/landing/logo/fourlinq.png", alt: "FourlinQ", scale: 1, width: 423, height: 141 },
  {
    src: "/landing/logo/pcedm-members.png",
    alt: "PCEDM Members",
    scale: 1.18,
    width: 718,
    height: 298,
  },
  { src: "/landing/logo/nokoji.webp", alt: "Nokoji Matcha and Doughnuts", scale: 1.08, width: 720, height: 296 },
  { src: "/landing/logo/felici-artisan-gelato.png", alt: "Felici Artisan Gelato", scale: 1.18, width: 829, height: 344 },
  // Visible bounds are (41, 9)–(950, 128) on a 960×139 canvas.
  // Offset the artwork's center, including its asymmetric transparent padding.
  { src: "/landing/logo/floodpass.webp", alt: "FloodPASS PH", scale: 1.12, width: 960, height: 139, offsetX: "-1.615%", offsetY: "0.719%" },
] as const;

/** The services section: its title, then the Connect, Automate, and Grow chapters. */
export const servicesTitle = "Prepare your business for AI modernization";

export interface Chapter {
  title: string;
  line: string;
  chips: string[];
}

export const serviceChapters: Chapter[] = [
  {
    title: "Connect",
    line: "Every part of your business in one system.",
    chips: ["Billing", "POS", "Scheduling", "Data migration"],
  },
  {
    title: "Automate",
    line: "AI answers calls, books clients, and follows up.",
    chips: ["Calls", "Bookings", "Website chat", "Follow-ups"],
  },
  {
    title: "Grow",
    line: "Turn visitors into paying customers.",
    chips: ["Websites", "Lead capture", "Online booking", "Reporting"],
  },
];
