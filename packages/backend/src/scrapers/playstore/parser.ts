/** Safely navigate nested arrays without throwing */
function get(obj: unknown, ...path: number[]): unknown {
  let current = obj;
  for (const key of path) {
    if (!Array.isArray(current) || current[key] === undefined) return undefined;
    current = current[key];
  }
  return current;
}

function str(obj: unknown, ...path: number[]): string | undefined {
  const val = get(obj, ...path);
  return typeof val === 'string' ? val : undefined;
}

function num(obj: unknown, ...path: number[]): number | undefined {
  const val = get(obj, ...path);
  return typeof val === 'number' ? val : undefined;
}

const DATA_BLOCK_RE =
  /AF_initDataCallback\(\{key: '(ds:\d+)', hash: '\d+', data:(.*?), sideChannel: \{\}\}\);/gs;

/** Extract all AF_initDataCallback data blocks from a Play Store HTML page */
export function extractDataBlocks(html: string): Map<string, unknown> {
  const blocks = new Map<string, unknown>();
  let match;
  DATA_BLOCK_RE.lastIndex = 0;
  while ((match = DATA_BLOCK_RE.exec(html)) !== null) {
    try {
      blocks.set(match[1]!, JSON.parse(match[2]!));
    } catch {
      // Skip unparseable blocks
    }
  }
  return blocks;
}

export interface ParsedAppDetails {
  appId: string;
  title: string;
  shortDescription: string;
  description: string;
  descriptionHtml: string;
  developer: string;
  developerEmail?: string;
  developerWebsite?: string;
  developerAddress?: string;
  icon: string;
  headerImage?: string;
  screenshots: string[];
  video?: string;
  category: string;
  categoryId?: string;
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
  updatedText?: string;
  version?: string;
  recentChanges?: string;
  url: string;
}

/** Parse app details from the ds:5 data block */
export function parseAppDetails(blocks: Map<string, unknown>): ParsedAppDetails | null {
  const ds5 = blocks.get('ds:5') as unknown[];
  if (!ds5) return null;

  const app = get(ds5, 1, 2) as unknown[];
  if (!app) return null;

  const packageName = str(app, 77, 0);
  if (!packageName) return null;

  const histogram = get(app, 51, 1) as unknown[] | undefined;

  return {
    appId: packageName,
    title: str(app, 0, 0) ?? '',
    shortDescription: str(app, 73, 0, 1) ?? '',
    descriptionHtml: str(app, 72, 0, 1) ?? '',
    description: (str(app, 72, 0, 1) ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
    developer: str(app, 68, 0) ?? '',
    developerEmail: str(app, 69, 1, 0),
    developerWebsite: str(app, 69, 0, 5, 2),
    developerAddress: str(app, 69, 4, 2, 0),
    icon: str(app, 95, 0, 3, 2) ?? '',
    headerImage: str(app, 96, 0, 3, 2),
    screenshots: extractScreenshots(app),
    video: str(app, 100, 0, 0, 3, 2) ?? str(app, 100, 1, 0, 0, 3, 2),
    category: str(app, 79, 0, 0, 0) ?? '',
    categoryId: str(app, 79, 0, 0, 2),
    score: num(app, 51, 0, 1) ?? 0,
    ratings: num(app, 51, 2, 1) ?? 0,
    histogram: {
      1: (get(histogram, 1, 1) as number) ?? 0,
      2: (get(histogram, 2, 1) as number) ?? 0,
      3: (get(histogram, 3, 1) as number) ?? 0,
      4: (get(histogram, 4, 1) as number) ?? 0,
      5: (get(histogram, 5, 1) as number) ?? 0,
    },
    installs: str(app, 13, 0) ?? str(app, 13, 3) ?? '',
    free: num(app, 57, 0, 0, 0, 0, 1, 0, 0) === 0,
    price: num(app, 57, 0, 0, 0, 0, 1, 0, 0) ?? 0,
    currency: str(app, 57, 0, 0, 0, 0, 1, 0, 1),
    contentRating: str(app, 9, 0),
    released: str(app, 10, 0),
    updated: num(app, 145, 0, 1, 0),
    updatedText: str(app, 145, 0, 0),
    recentChanges: str(app, 144, 1, 1),
    url: `https://play.google.com/store/apps/details?id=${packageName}`,
  };
}

function extractScreenshots(app: unknown[]): string[] {
  const screenshotArray = get(app, 78, 0) as unknown[] | undefined;
  if (!Array.isArray(screenshotArray)) return [];

  return screenshotArray
    .map((s) => str(s as unknown[], 3, 2))
    .filter((url): url is string => typeof url === 'string');
}

export interface ParsedReview {
  id: string;
  userName: string;
  userImage?: string;
  date: string;
  score: number;
  text: string;
  replyDate?: string;
  replyText?: string;
  thumbsUp: number;
  version?: string;
}

/** Parse reviews from the ds:11 data block */
export function parseReviews(blocks: Map<string, unknown>): ParsedReview[] {
  const ds11 = blocks.get('ds:11') as unknown[];
  if (!ds11) return [];

  const reviewList = get(ds11, 0) as unknown[];
  if (!Array.isArray(reviewList)) return [];

  const reviews: ParsedReview[] = [];

  for (const review of reviewList) {
    const r = review as unknown[];
    const id = str(r, 0);
    if (!id) continue;

    reviews.push({
      id,
      userName: str(r, 1, 0) ?? '',
      userImage: str(r, 1, 1, 3, 2),
      date: str(r, 5, 0) ?? '',
      score: num(r, 2) ?? 0,
      text: str(r, 4) ?? '',
      thumbsUp: num(r, 6) ?? 0,
      version: str(r, 10),
      replyText: str(r, 7, 1),
      replyDate: str(r, 7, 2, 0),
    });
  }

  return reviews;
}

export interface ParsedSearchResult {
  appId: string;
  title: string;
  developer: string;
  icon: string;
  score: number;
  scoreText: string;
  installs: string;
  category: string;
  free: boolean;
  url: string;
}

/** Parse search results from the ds:4 data block */
export function parseSearchResults(blocks: Map<string, unknown>): ParsedSearchResult[] {
  const ds4 = blocks.get('ds:4') as unknown[];
  if (!ds4) return [];

  // data[0][1][0][22] contains the cluster, which is an array of app items
  const cluster = get(ds4, 0, 1, 0, 22) as unknown[];
  if (!Array.isArray(cluster)) return [];

  // cluster[0] is the main results list — each item is [appData, ...]
  const appList = cluster[0] as unknown[];
  if (!Array.isArray(appList)) return [];

  const results: ParsedSearchResult[] = [];

  for (const entry of appList) {
    // Each entry: entry[0] is the app data array
    const app = get(entry, 0) as unknown[];
    if (!Array.isArray(app)) continue;

    const appId = str(app, 0, 0);
    if (!appId) continue;

    results.push({
      appId,
      title: str(app, 3) ?? '',
      developer: str(app, 14) ?? '',
      icon: str(app, 1, 3, 2) ?? '',
      score: num(app, 4, 1) ?? 0,
      scoreText: str(app, 4, 0) ?? '',
      installs: str(app, 15) ?? '',
      category: str(app, 5) ?? '',
      free: num(app, 8, 5) === 1,
      url: `https://play.google.com/store/apps/details?id=${appId}`,
    });
  }

  return results;
}
