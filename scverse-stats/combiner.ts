import "dotenv/config";
import { CombinedStatsSchema } from "./types";
import { loadJson, saveJson } from "./utils";

export async function combineStats(): Promise<void> {
  const githubData = await loadJson("github.json");
  const zulipData = await loadJson("zulip.json");
  const blueskyData = await loadJson("bluesky.json");
  const ecosystemData = await loadJson("ecosystem.json");
  const citationsData = await loadJson("citations.json");
  const pepyData = await loadJson("pepy.json");

  const combinedStats: any = {
    timestamp: new Date().toISOString(),
  };

  if (blueskyData) {
    combinedStats.bluesky_followers = blueskyData.followers_count;
  }

  if (zulipData) {
    combinedStats.zulip_users = zulipData.active_users;
  }

  if (githubData) {
    combinedStats.github = {
      total_repositories: githubData.total_repositories,
      total_stars: githubData.total_stars,
      total_stars_last_month: githubData.total_stars_last_month,
      total_stars_last_year: githubData.total_stars_last_year,
      unique_contributors: githubData.unique_contributors,
      organization_members: githubData.organization_members,
      total_pull_requests_open: githubData.total_pull_requests_open,
      total_pull_requests_closed: githubData.total_pull_requests_closed,
      total_issues_open: githubData.total_issues_open,
      total_issues_closed: githubData.total_issues_closed,
    };
  }

  if (ecosystemData) {
    combinedStats.ecosystem_packages = ecosystemData.total_packages;
  }

  if (citationsData) {
    combinedStats.citation_count = citationsData.total_citation_count;
  }

  if (pepyData) {
    combinedStats.pepy_downloads = pepyData.total_downloads;
    if (
      pepyData.computed &&
      typeof pepyData.computed.combined_avg_daily === "number"
    ) {
      combinedStats.pepy_avg_daily_30 = Math.round(
        pepyData.computed.combined_avg_daily,
      );
    }
  }

  const validated = CombinedStatsSchema.parse(combinedStats);
  await saveJson("stats.json", validated);
}
