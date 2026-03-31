/**
 * Wrapper around the `google-play-scraper` npm package.
 *
 * This package reverse-engineers Google Play's internal APIs (the same
 * AF_initDataCallback data blocks we parse manually, plus additional
 * endpoints). It's community-maintained and stays updated when Google
 * changes their internal structures — which they do frequently.
 *
 * We use this as the PRIMARY data source, with our own HTML parsing
 * as a FALLBACK for when the package fails or returns incomplete data.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
import gplay from 'google-play-scraper';

/** Decode HTML entities like &amp; → &, &#39; → ', etc. */
const decodeHtml = (s: string) =>
  s.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

// Sort constants for reviews (the .sort property typing is incomplete in the package)
export const GplaySort = {
  NEWEST: 2,
  HELPFULNESS: 1,
  RATING: 3,
} as const;

// ─── Types ───

export interface GplaySearchResult {
  appId: string;
  title: string;
  developer: string;
  icon: string;
  score: number;
  scoreText: string;
  installs?: string;
  free: boolean;
  url: string;
}

export interface GplayAppDetails {
  appId: string;
  title: string;
  summary: string;          // short description
  description: string;      // full description (plain text)
  descriptionHTML: string;   // full description (HTML)
  developer: string;
  developerEmail?: string;
  developerWebsite?: string;
  developerAddress?: string;
  icon: string;
  headerImage?: string;
  screenshots: string[];
  video?: string;
  genre: string;
  genreId?: string;
  score: number;
  ratings: number;
  histogram: { 1: number; 2: number; 3: number; 4: number; 5: number };
  installs: string;
  free: boolean;
  price: number;
  currency?: string;
  contentRating?: string;
  released?: string;
  updated?: number;
  version?: string;
  recentChanges?: string;
  url: string;
}

export interface GplayReview {
  id: string;
  userName: string;
  userImage?: string;
  date: string;
  score: number;
  text: string;
  thumbsUp: number;
  version?: string;
  replyText?: string;
  replyDate?: string;
}

export interface GplaySimilarApp {
  appId: string;
  title: string;
  developer: string;
  icon: string;
  score: number;
  url: string;
}

// ─── API functions ───

/** Search Play Store for apps matching a keyword */
export async function gplaySearch(
  term: string,
  opts: { num?: number; lang?: string; country?: string } = {},
): Promise<GplaySearchResult[]> {
  const { num = 50, lang = 'en', country = 'us' } = opts;

  const results = await gplay.search({
    term,
    num,
    lang,
    country,
    fullDetail: false,
  });

  return results.map((r) => ({
    appId: r.appId,
    title: r.title,
    developer: r.developer ?? '',
    icon: r.icon ?? '',
    score: r.score ?? 0,
    scoreText: r.scoreText ?? '',
    installs: (r as unknown as Record<string, unknown>).installs as string | undefined,
    free: r.free !== false,
    url: r.url ?? `https://play.google.com/store/apps/details?id=${r.appId}`,
  }));
}

/** Get full app details by package name */
export async function gplayApp(
  appId: string,
  opts: { lang?: string; country?: string } = {},
): Promise<GplayAppDetails> {
  const { lang = 'en', country = 'us' } = opts;

  const r = await gplay.app({ appId, lang, country });

  return {
    appId: r.appId,
    title: decodeHtml(r.title ?? ''),
    summary: decodeHtml(r.summary ?? ''),
    description: r.description ?? '',
    descriptionHTML: r.descriptionHTML ?? '',
    developer: r.developer ?? '',
    developerEmail: r.developerEmail,
    developerWebsite: r.developerWebsite,
    developerAddress: r.developerAddress,
    icon: r.icon ?? '',
    headerImage: r.headerImage,
    screenshots: r.screenshots ?? [],
    video: r.video,
    genre: r.genre ?? '',
    genreId: r.genreId,
    score: r.score ?? 0,
    ratings: r.ratings ?? 0,
    histogram: {
      1: (r.histogram as Record<string, number>)?.[1] ?? 0,
      2: (r.histogram as Record<string, number>)?.[2] ?? 0,
      3: (r.histogram as Record<string, number>)?.[3] ?? 0,
      4: (r.histogram as Record<string, number>)?.[4] ?? 0,
      5: (r.histogram as Record<string, number>)?.[5] ?? 0,
    },
    installs: r.installs ?? '',
    free: r.free !== false,
    price: r.price ?? 0,
    currency: r.currency,
    contentRating: r.contentRating,
    released: r.released,
    updated: r.updated,
    version: r.version,
    recentChanges: r.recentChanges,
    url: r.url ?? `https://play.google.com/store/apps/details?id=${r.appId}`,
  };
}

/** Get autocomplete suggestions for a search term */
export async function gplaySuggest(
  term: string,
): Promise<string[]> {
  const results = await gplay.suggest({ term });
  // Results are either strings or objects with .term
  return results.map((r) => (typeof r === 'string' ? r : (r as { term: string }).term));
}

/** Get reviews for an app */
export async function gplayReviews(
  appId: string,
  opts: { num?: number; sort?: number; lang?: string; country?: string; paginate?: boolean; nextPaginationToken?: string } = {},
): Promise<{ data: GplayReview[]; nextPaginationToken?: string }> {
  const { num = 100, sort = GplaySort.NEWEST, lang = 'en', country = 'us', paginate = false, nextPaginationToken } = opts;

  const result = await gplay.reviews({
    appId,
    num,
    sort,
    lang,
    country,
    paginate,
    nextPaginationToken,
  });

  // reviews() returns { data: [...], nextPaginationToken } when paginate=true
  // or just an array when paginate=false
  const reviewList = Array.isArray(result) ? result : (result as { data: unknown[] }).data;
  const token = Array.isArray(result) ? undefined : (result as { nextPaginationToken?: string }).nextPaginationToken;

  return {
    data: (reviewList ?? []).map((item: unknown) => {
      const r = item as Record<string, unknown>;
      return {
        id: (r.id as string) ?? '',
        userName: (r.userName as string) ?? '',
        userImage: r.userImage as string | undefined,
        date: r.date ? new Date(r.date as string).toISOString() : new Date().toISOString(),
        score: (r.score as number) ?? 0,
        text: (r.text as string) ?? '',
        thumbsUp: (r.thumbsUp as number) ?? 0,
        version: r.version as string | undefined,
        replyText: r.replyText as string | undefined,
        replyDate: r.replyDate ? new Date(r.replyDate as string).toISOString() : undefined,
      };
    }),
    nextPaginationToken: token,
  };
}

/** Get similar apps */
export async function gplaySimilar(
  appId: string,
  opts: { lang?: string; country?: string } = {},
): Promise<GplaySimilarApp[]> {
  const { lang = 'en', country = 'us' } = opts;

  const results = await gplay.similar({ appId, lang, country });

  return results.map((r) => ({
    appId: r.appId,
    title: r.title,
    developer: r.developer ?? '',
    icon: r.icon ?? '',
    score: r.score ?? 0,
    url: r.url ?? `https://play.google.com/store/apps/details?id=${r.appId}`,
  }));
}
