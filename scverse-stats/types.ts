import { z } from "zod";

// Zulip schemas
export const ZulipUserSchema = z.object({
  user_id: z.number(),
  is_bot: z.boolean(),
  is_active: z.boolean(),
  date_joined: z.string(),
});

export type ZulipUser = z.infer<typeof ZulipUserSchema>;

export const ZulipDataSchema = z.object({
  active_users: z.number(),
  timestamp: z.string(),
});

export type ZulipData = z.infer<typeof ZulipDataSchema>;

// Bluesky schemas
export const BlueskyProfileSchema = z.object({
  did: z.string(),
  handle: z.string(),
  displayName: z.string().nullable(),
  followersCount: z.number(),
  followsCount: z.number(),
  postsCount: z.number(),
});

export type BlueskyProfile = z.infer<typeof BlueskyProfileSchema>;

export const BlueskyDataSchema = z.object({
  followers_count: z.number(),
  handle: z.string(),
  timestamp: z.string(),
});

export type BlueskyData = z.infer<typeof BlueskyDataSchema>;

// Ecosystem packages schemas
export const EcosystemPackageSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  project_home: z.string().url(),
  documentation_home: z.string().url().nullable(),
});

export type EcosystemPackage = z.infer<typeof EcosystemPackageSchema>;

export const EcosystemDataSchema = z.object({
  total_packages: z.number(),
  packages: z.array(EcosystemPackageSchema),
  timestamp: z.string(),
});

export type EcosystemData = z.infer<typeof EcosystemDataSchema>;

// GitHub schemas
export const GitHubRepositorySchema = z.object({
  name: z.string(),
  full_name: z.string(),
  stargazers_count: z.number(),
  stars_last_month: z.number(),
  stars_last_year: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  description: z.string().nullable(),
  html_url: z.string().url(),
  language: z.string().nullable(),
  updated_at: z.string(),
  contributors_count: z.number(),
  pull_requests_open: z.number(),
  pull_requests_closed: z.number(),
  pull_requests_last_month: z.number(),
  issues_open: z.number(),
  issues_closed: z.number(),
  issues_last_month: z.number(),
});

export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;

export const GitHubDataSchema = z.object({
  organization: z.string(),
  total_repositories: z.number(),
  total_stars: z.number(),
  total_stars_last_month: z.number(),
  total_stars_last_year: z.number(),
  unique_contributors: z.number(),
  organization_members: z.number(),
  total_pull_requests_open: z.number(),
  total_pull_requests_closed: z.number(),
  total_issues_open: z.number(),
  total_issues_closed: z.number(),
  timestamp: z.string(),
  repositories: z.array(GitHubRepositorySchema),
});

export type GitHubData = z.infer<typeof GitHubDataSchema>;

// Citations schemas
export const CitationPaperSchema = z.object({
  pmid: z.string(),
  citation_count: z.number(),
});

export type CitationPaper = z.infer<typeof CitationPaperSchema>;

export const CitationsDataSchema = z.object({
  papers: z.array(CitationPaperSchema),
  total_citation_count: z.number(),
  timestamp: z.string(),
});

export type CitationsData = z.infer<typeof CitationsDataSchema>;

// Combined statistics schema
export const CombinedStatsSchema = z.object({
  timestamp: z.string(),
  bluesky_followers: z.number().optional(),
  zulip_users: z.number().optional(),
  github: z
    .object({
      total_repositories: z.number(),
      total_stars: z.number(),
      total_stars_last_month: z.number(),
      total_stars_last_year: z.number(),
      unique_contributors: z.number(),
      organization_members: z.number(),
      total_pull_requests_open: z.number(),
      total_pull_requests_closed: z.number(),
      total_issues_open: z.number(),
      total_issues_closed: z.number(),
    })
    .optional(),
  ecosystem_packages: z.number().optional(),
  citation_count: z.number().optional(),
  pepy_downloads: z.number().optional(),
  pepy_avg_daily_30: z.number().optional(),
});

export type CombinedStats = z.infer<typeof CombinedStatsSchema>;

// PEPY schemas
export const PepyPackageSchema = z.object({
  id: z.string(),
  total_downloads: z.number(),
  versions: z.array(z.string()),
  downloads: z.record(z.string(), z.record(z.string(), z.number())),
});

export type PepyPackage = z.infer<typeof PepyPackageSchema>;

export const PepyDataSchema = z.object({
  packages: z.array(PepyPackageSchema),
  total_downloads: z.number(),
  timestamp: z.string(),
});

export type PepyData = z.infer<typeof PepyDataSchema>;
