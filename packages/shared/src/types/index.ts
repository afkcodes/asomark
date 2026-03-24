// ── Enums ──────────────────────────────────────────────────────────────────

export enum Platform {
  Android = "android",
  iOS = "ios",
}

export enum ExperimentStatus {
  Planning = "planning",
  Pending = "pending",
  Approved = "approved",
  Creating = "creating",
  Running = "running",
  Monitoring = "monitoring",
  Analyzing = "analyzing",
  Winner = "winner",
  NoWinner = "no_winner",
  Applied = "applied",
  Rejected = "rejected",
  Failed = "failed",
}

export enum AuthorityLevel {
  L0 = "L0",
  L1 = "L1",
  L2 = "L2",
  L3 = "L3",
}

// ── Entity types ───────────────────────────────────────────────────────────

export interface App {
  id: string;
  packageName: string | null;
  bundleId: string | null;
  name: string;
  platform: Platform;
  isOurs: boolean;
  category: string | null;
  createdAt: Date;
}

export interface Keyword {
  id: string;
  term: string;
  platform: Platform;
  searchVolumeEst: number | null;
  difficultyEst: number | null;
  lastUpdated: Date;
}

export interface RankSnapshot {
  id: string;
  appId: string;
  keywordId: string;
  platform: Platform;
  rank: number;
  date: Date;
  categoryRank: number | null;
}

export interface ListingSnapshot {
  id: string;
  appId: string;
  title: string;
  subtitle: string | null;
  shortDesc: string | null;
  longDesc: string | null;
  iconUrl: string | null;
  screenshotUrls: string[];
  videoUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  installsText: string | null;
  version: string | null;
  appSize: string | null;
  snapshotDate: Date;
  diffFromPrevious: string | null;
}

export interface Experiment {
  id: string;
  appId: string;
  platform: Platform;
  type: string;
  status: ExperimentStatus;
  variantsJson: unknown;
  startedAt: Date | null;
  endedAt: Date | null;
  resultsJson: unknown;
  winner: string | null;
  applied: boolean;
  confidence: number | null;
}

export interface ExperimentChange {
  id: string;
  experimentId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changeDate: Date;
  impactMetricsJson: unknown;
}

export interface Review {
  id: string;
  appId: string;
  platform: Platform;
  author: string | null;
  rating: number;
  text: string | null;
  date: Date;
  sentimentScore: number | null;
  topicsJson: unknown;
  language: string | null;
}

export interface KeywordOpportunity {
  id: string;
  keywordId: string;
  appId: string;
  currentRank: number | null;
  potentialRank: number | null;
  opportunityScore: number;
  suggestedAction: string | null;
  createdAt: Date;
}

export interface HealthScore {
  id: string;
  appId: string;
  overallScore: number;
  breakdownJson: unknown;
  date: Date;
}

export interface ChangeLogEntry {
  id: string;
  appId: string;
  changeType: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  source: string | null;
  metadataJson: unknown;
  timestamp: Date;
}

export interface RankCorrelation {
  id: string;
  changeLogId: string;
  keywordId: string;
  rankBefore: number | null;
  rankAfter: number | null;
  cvrBefore: number | null;
  cvrAfter: number | null;
  daysToEffect: number | null;
  confidence: number | null;
  notes: string | null;
}

export interface StrategyLogEntry {
  id: string;
  appId: string;
  actionType: string;
  reasoning: string;
  suggestedChange: string | null;
  authorityLevel: AuthorityLevel;
  status: string;
  createdAt: Date;
  approvedAt: Date | null;
  executedAt: Date | null;
}

export interface ScrapeJob {
  id: string;
  source: string;
  target: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  recordsScraped: number | null;
  errors: string | null;
}
