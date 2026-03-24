/**
 * Multi-region support — 32+ countries in 3 ARPU tiers.
 */

export type CountryTier = 'T1' | 'T2' | 'T3';

export interface Country {
  code: string;
  name: string;
  tier: CountryTier;
}

export const COUNTRIES: Country[] = [
  // T1: High ARPU ($15+)
  { code: 'us', name: 'United States', tier: 'T1' },
  { code: 'jp', name: 'Japan', tier: 'T1' },
  { code: 'kr', name: 'South Korea', tier: 'T1' },
  { code: 'gb', name: 'United Kingdom', tier: 'T1' },
  { code: 'de', name: 'Germany', tier: 'T1' },
  { code: 'au', name: 'Australia', tier: 'T1' },
  { code: 'ca', name: 'Canada', tier: 'T1' },
  { code: 'fr', name: 'France', tier: 'T1' },
  { code: 'ch', name: 'Switzerland', tier: 'T1' },
  { code: 'se', name: 'Sweden', tier: 'T1' },
  { code: 'nl', name: 'Netherlands', tier: 'T1' },
  { code: 'no', name: 'Norway', tier: 'T1' },
  { code: 'dk', name: 'Denmark', tier: 'T1' },
  { code: 'sg', name: 'Singapore', tier: 'T1' },
  { code: 'hk', name: 'Hong Kong', tier: 'T1' },
  { code: 'tw', name: 'Taiwan', tier: 'T1' },

  // T2: High volume, lower ARPU
  { code: 'in', name: 'India', tier: 'T2' },
  { code: 'br', name: 'Brazil', tier: 'T2' },
  { code: 'mx', name: 'Mexico', tier: 'T2' },
  { code: 'id', name: 'Indonesia', tier: 'T2' },
  { code: 'ph', name: 'Philippines', tier: 'T2' },
  { code: 'ru', name: 'Russia', tier: 'T2' },
  { code: 'tr', name: 'Turkey', tier: 'T2' },
  { code: 'it', name: 'Italy', tier: 'T2' },
  { code: 'es', name: 'Spain', tier: 'T2' },
  { code: 'pl', name: 'Poland', tier: 'T2' },

  // T3: Emerging markets
  { code: 'th', name: 'Thailand', tier: 'T3' },
  { code: 'vn', name: 'Vietnam', tier: 'T3' },
  { code: 'my', name: 'Malaysia', tier: 'T3' },
  { code: 'ng', name: 'Nigeria', tier: 'T3' },
  { code: 'eg', name: 'Egypt', tier: 'T3' },
  { code: 'ar', name: 'Argentina', tier: 'T3' },
  { code: 'co', name: 'Colombia', tier: 'T3' },
  { code: 'za', name: 'South Africa', tier: 'T3' },
  { code: 'ua', name: 'Ukraine', tier: 'T3' },
  { code: 'ro', name: 'Romania', tier: 'T3' },
];

export const TIER_LABELS: Record<CountryTier, string> = {
  T1: 'Tier 1 — Premium markets (ARPU $15+)',
  T2: 'Tier 2 — High volume, lower ARPU',
  T3: 'Tier 3 — Emerging markets',
};

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code.toLowerCase());
}

export function getCountriesByTier(tier: CountryTier): Country[] {
  return COUNTRIES.filter((c) => c.tier === tier);
}
