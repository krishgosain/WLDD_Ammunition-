/**
 * Taxonomy — the layer that lets "cosmetic brand" find `Cosmetics & Skin Care`.
 *
 * Keys are concepts a BD person types under time pressure. Values are literal
 * strings that exist in the sheet. `npm run ingest` prints any industry with no
 * entry here, so the map stays honest as the sheet grows.
 */

export const INDUSTRY_SYNONYMS: Record<string, string[]> = {
  cosmetic: ['Cosmetics & Skin Care'], cosmetics: ['Cosmetics & Skin Care'],
  beauty: ['Cosmetics & Skin Care'], skincare: ['Cosmetics & Skin Care'],
  skin: ['Cosmetics & Skin Care'], makeup: ['Cosmetics & Skin Care'],
  grooming: ['Cosmetics & Skin Care'], personalcare: ['Cosmetics & Skin Care'],

  finance: ['Finance'], fintech: ['Finance'], bank: ['Finance'], banking: ['Finance'],
  bfsi: ['Finance'], insurance: ['Finance'], lending: ['Finance'], loan: ['Finance'],
  investment: ['Finance'], wealth: ['Finance'], payments: ['Finance'], upi: ['Finance'],
  trading: ['Finance'], mutual: ['Finance'],

  ott: ['OTT'], streaming: ['OTT'], series: ['OTT'], webseries: ['OTT'],
  entertainment: ['OTT', 'Movie', 'Music'],

  movie: ['Movie'], film: ['Movie'], cinema: ['Movie'], bollywood: ['Movie'],
  trailer: ['Movie'], theatrical: ['Movie'],

  music: ['Music'], audio: ['Music'], song: ['Music'], album: ['Music'],
  podcast: ['Music'], label: ['Music'],

  auto: ['Automobile'], automobile: ['Automobile'], automotive: ['Automobile'],
  car: ['Automobile'], ev: ['Automobile'], scooter: ['Automobile'], bike: ['Automobile'],
  'two wheeler': ['Automobile'], suv: ['Automobile'],

  fashion: ['Fashion'], apparel: ['Fashion'], clothing: ['Fashion'],
  footwear: ['Fashion'], shoes: ['Fashion'], luxury: ['Fashion', 'Jewellery'],
  style: ['Fashion'],

  ecommerce: ['E-commerce'], 'e-commerce': ['E-commerce'], retail: ['E-commerce'],
  marketplace: ['E-commerce'], quickcommerce: ['E-commerce'], d2c: ['E-commerce', 'FMCG'],
  shopping: ['E-commerce'], sale: ['E-commerce'],

  fmcg: ['FMCG'], cpg: ['FMCG'], packaged: ['FMCG'], beverage: ['FMCG'],
  snack: ['FMCG'], staples: ['FMCG'],
  food: ['FMCG', 'Restaurants and food delivery'],

  restaurant: ['Restaurants and food delivery'],
  restaurants: ['Restaurants and food delivery'],
  'food delivery': ['Restaurants and food delivery'],
  qsr: ['Restaurants and food delivery'], dining: ['Restaurants and food delivery'],
  delivery: ['Restaurants and food delivery'],

  edtech: ['Edtech'], education: ['Edtech'], university: ['Edtech'],
  college: ['Edtech'], learning: ['Edtech'], upskilling: ['Edtech'], exam: ['Edtech'],

  tech: ['Software/Technology'], technology: ['Software/Technology'],
  software: ['Software/Technology'], saas: ['Software/Technology'],
  startup: ['Software/Technology'], ai: ['Software/Technology'],
  app: ['Software/Technology', 'Mobile'],

  gaming: ['Gaming'], game: ['Gaming'], esports: ['Gaming'], rmg: ['Gaming', 'RMG'],
  mobile: ['Mobile'], phone: ['Mobile'], smartphone: ['Mobile'], handset: ['Mobile'],
  electronics: ['Electronics'], gadget: ['Electronics'], appliance: ['Electronics'],
  tv: ['Electronics'], wearable: ['Electronics'],

  travel: ['Travel'], tourism: ['Travel'], airline: ['Travel'], hotel: ['Travel'],
  holiday: ['Travel'], booking: ['Travel'],

  health: ['Healthcare'], healthcare: ['Healthcare'], pharma: ['Healthcare'],
  wellness: ['Healthcare'], fitness: ['Healthcare'], hospital: ['Healthcare'],
  clinic: ['Healthcare'],

  realestate: ['Real estate'], 'real estate': ['Real estate'], property: ['Real estate'],
  housing: ['Real estate'],

  jewellery: ['Jewellery'], jewelry: ['Jewellery'], gold: ['Jewellery'],
  diamond: ['Jewellery'],

  logistics: ['Logistics & Courier'], courier: ['Logistics & Courier'],
  shipping: ['Logistics & Courier'],
  cab: ['Commute Aggregators'], taxi: ['Commute Aggregators'],
  ride: ['Commute Aggregators'], commute: ['Commute Aggregators'],
  sports: ['Sports'], cricket: ['Sports'], ipl: ['Sports'], football: ['Sports'],
};

/** Concepts that name a service rather than a vertical. */
export const SERVICE_SYNONYMS: Record<string, string[]> = {
  amplification: ['Amplification'], amplify: ['Amplification'], amp: ['Amplification'],
  reach: ['Amplification'], seeding: ['Seeding', 'Amplification'],
  meme: ["Meme'd"], memes: ["Meme'd"], memed: ["Meme'd"],
  viral: ['Amplification', "Meme'd"], virality: ['Amplification', "Meme'd"],
  influencer: ['Influencers'], influencers: ['Influencers'],
  creator: ['Influencers'], creators: ['Influencers'], kol: ['Influencers'],
  orm: ['ORM'], reputation: ['ORM'], crisis: ['ORM'], moderation: ['ORM'],
  twitter: ['Twitter Trend'], trend: ['Twitter Trend'], trending: ['Twitter Trend'],
  x: ['Twitter Trend'],
  offline: ['Offline Activity'], activation: ['Offline Activity'],
  event: ['Offline Activity'], onground: ['Offline Activity'],
  illustration: ['Content Creation'], design: ['Content Creation'],
  content: ['Content Creation'], creative: ['Content Creation'],
  production: ['Production'], shoot: ['Production'], video: ['Production'],
  dp: ['DP Pages'], 'dp pages': ['DP Pages'],
  solo: ['SOLO'], analytics: ['Campaign Analytics'],
};

/** Shelf grouping for the department nav. Order is display order. */
export const DEPARTMENTS: { label: string; industries: string[] }[] = [
  { label: 'Entertainment', industries: ['OTT', 'Movie', 'Music', 'Gaming', 'Sports', 'RMG'] },
  { label: 'Commerce', industries: ['E-commerce', 'Fashion', 'FMCG', 'Jewellery', 'Restaurants and food delivery'] },
  { label: 'Technology', industries: ['Software/Technology', 'Mobile', 'Electronics'] },
  { label: 'Money & Learning', industries: ['Finance', 'Edtech'] },
  { label: 'Lifestyle', industries: ['Cosmetics & Skin Care', 'Healthcare', 'Travel'] },
  { label: 'Movement', industries: ['Automobile', 'Commute Aggregators', 'Logistics & Courier', 'Real estate'] },
];

/** Stable colour index per industry, shared by cards, charts and the 3D field. */
export const SERIES = [
  '#FF3427', '#8580F7', '#FFD644', '#DF29B1', '#5271FF',
  '#2ED47A', '#F97D92', '#00C2CC', '#FF8A3D', '#B388FF',
];

const hueCache = new Map<string, string>();
export function industryColour(industry: string, all: string[]): string {
  const cached = hueCache.get(industry);
  if (cached) return cached;
  const i = all.indexOf(industry);
  const c = SERIES[(i < 0 ? all.length : i) % SERIES.length];
  hueCache.set(industry, c);
  return c;
}

export function resolveConcept(token: string): { industries: string[]; services: string[] } {
  const t = token.toLowerCase().trim();
  return { industries: INDUSTRY_SYNONYMS[t] ?? [], services: SERVICE_SYNONYMS[t] ?? [] };
}
