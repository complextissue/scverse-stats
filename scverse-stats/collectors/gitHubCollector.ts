import "dotenv/config";
import { promises as fs } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import { octokit } from "../octokit";
import { GitHubDataSchema, GitHubRepository } from "../types";
import { saveJson, sleep } from "../utils";

async function getStarStats(owner: string, repo: string) {
  const now = new Date();
  const oneMonthAgo = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    now.getDate(),
  );
  const oneYearAgo = new Date(
    now.getFullYear() - 1,
    now.getMonth(),
    now.getDate(),
  );

  let starsLastMonth = 0;
  let starsLastYear = 0;
  let page = 1;

  while (true) {
    const { data } = await octokit.rest.activity.listStargazersForRepo({
      owner,
      repo,
      per_page: 100,
      page,
      headers: { Accept: "application/vnd.github.v3.star+json" },
    });

    if (data.length === 0) break;

    for (const star of data) {
      if (star.starred_at) {
        const starDate = new Date(star.starred_at);
        if (starDate >= oneMonthAgo) starsLastMonth++;
        if (starDate >= oneYearAgo) starsLastYear++;
      }
    }

    if (data.length < 100) break;
    page++;
    await sleep(100);
  }

  return { starsLastMonth, starsLastYear };
}

async function getPRStats(owner: string, repo: string) {
  const now = new Date();
  const oneMonthAgo = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    now.getDate(),
  );

  // Get count of open PRs
  const { headers: openHeaders } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 1,
  });

  // Get count of closed PRs
  const { headers: closedHeaders } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "closed",
    per_page: 1,
  });

  // Parse pagination headers to get total counts
  let openCount = 1;
  if (openHeaders.link) {
    const match = openHeaders.link.match(/page=(\d+)>; rel="last"/);
    openCount = match ? parseInt(match[1]) : 1;
  }

  let closedCount = 1;
  if (closedHeaders.link) {
    const match = closedHeaders.link.match(/page=(\d+)>; rel="last"/);
    closedCount = match ? parseInt(match[1]) : 1;
  }

  // Count PRs created in the last month
  let prsLastMonth = 0;
  let page = 1;

  while (page < 10) {
    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "all",
      per_page: 100,
      page,
      sort: "created",
      direction: "desc",
    });

    if (prs.length === 0) break;

    for (const pr of prs) {
      if (pr.created_at && new Date(pr.created_at) >= oneMonthAgo) {
        prsLastMonth++;
      } else {
        page = 99;
        break;
      }
    }
    page++;
  }

  return {
    open: openCount,
    closed: closedCount,
    last_month: prsLastMonth,
  };
}

async function getIssueStats(owner: string, repo: string) {
  const now = new Date();
  const oneMonthAgo = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    now.getDate(),
  );

  // Note: GitHub's Issues API returns both issues AND pull requests
  // We must filter out PRs (items with pull_request property) to get true issue counts
  let openCount = 0;
  let closedCount = 0;
  let issuesLastMonth = 0;

  // Count open issues (excluding PRs) - fetch all pages for exact count
  let page = 1;
  while (true) {
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "open",
      per_page: 100,
      page,
    });

    if (issues.length === 0) break;

    for (const issue of issues) {
      if (!issue.pull_request) {
        openCount++;
      }
    }

    if (issues.length < 100) break;
    page++;
    await sleep(100);
  }

  // Count closed issues (excluding PRs) - fetch all pages for exact count
  page = 1;
  while (true) {
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "closed",
      per_page: 100,
      page,
    });

    if (issues.length === 0) break;

    for (const issue of issues) {
      if (!issue.pull_request) {
        closedCount++;
      }
    }

    if (issues.length < 100) break;
    page++;
    await sleep(100);
  }

  // Count issues created in the last month (excluding PRs)
  page = 1;
  while (page < 10) {
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "all",
      per_page: 100,
      page,
      sort: "created",
      direction: "desc",
    });

    if (issues.length === 0) break;

    for (const issue of issues) {
      if (
        !issue.pull_request &&
        issue.created_at &&
        new Date(issue.created_at) >= oneMonthAgo
      ) {
        issuesLastMonth++;
      } else if (!issue.pull_request) {
        page = 99;
        break;
      }
    }
    page++;
    await sleep(100);
  }

  return {
    open: openCount,
    closed: closedCount,
    last_month: issuesLastMonth,
  };
}

async function collectContributors(repos: GitHubRepository[]): Promise<{
  allContributors: Set<string>;
  repoContributorCounts: Map<string, number>;
}> {
  const allContributors = new Set<string>();
  const repoContributorCounts = new Map<string, number>();

  for (const repo of repos) {
    const repoContributors = new Set<string>();
    let page = 1;

    while (true) {
      const { data } = await octokit.rest.repos.listContributors({
        owner: "scverse",
        repo: repo.name,
        per_page: 100,
        page,
      });

      if (data.length === 0) break;

      data.forEach((c) => {
        // Filter out bots
        if (c.login && !c.login.endsWith("[bot]") && !c.login.endsWith("-bot")) {
          allContributors.add(c.login);
          repoContributors.add(c.login);
        }
      });

      if (data.length < 100) break;
      page++;
      await sleep(100);
    }

    repoContributorCounts.set(repo.name, repoContributors.size);
  }

  return { allContributors, repoContributorCounts };
}

async function getOrgMemberCount(org: string): Promise<number> {
  const { headers } = await octokit.rest.orgs.listMembers({
    org,
    per_page: 1,
  });

  if (headers.link) {
    const match = headers.link.match(/page=(\d+)>; rel="last"/);
    return match ? parseInt(match[1]) : 1;
  }

  return 1;
}

export async function collectGitHubStats(): Promise<void> {
  console.log("Collecting GitHub stats...");

  const configPath = join(process.cwd(), "config", "config.yaml");
  const config = yaml.load(await fs.readFile(configPath, "utf8")) as {
    core_packages: string[];
  };

  const repos: GitHubRepository[] = [];

  for (const packageName of config.core_packages) {
    const { data: repo } = await octokit.rest.repos.get({
      owner: "scverse",
      repo: packageName,
    });

    const [starStats, prStats, issueStats] = await Promise.all([
      getStarStats("scverse", packageName).catch(() => ({
        starsLastMonth: 0,
        starsLastYear: 0,
      })),
      getPRStats("scverse", packageName).catch(() => ({
        open: 0,
        closed: 0,
        last_month: 0,
      })),
      getIssueStats("scverse", packageName).catch(() => ({
        open: 0,
        closed: 0,
        last_month: 0,
      })),
    ]);

    repos.push({
      name: repo.name,
      full_name: repo.full_name,
      stargazers_count: repo.stargazers_count || 0,
      stars_last_month: starStats.starsLastMonth,
      stars_last_year: starStats.starsLastYear,
      forks_count: repo.forks_count || 0,
      open_issues_count: repo.open_issues_count || 0,
      description: repo.description,
      html_url: repo.html_url,
      language: repo.language || null,
      updated_at: repo.updated_at || "",
      contributors_count: 0, // Will be updated after collecting contributors
      pull_requests_open: prStats.open,
      pull_requests_closed: prStats.closed,
      pull_requests_last_month: prStats.last_month,
      issues_open: issueStats.open,
      issues_closed: issueStats.closed,
      issues_last_month: issueStats.last_month,
    });

    console.log(`  ${packageName} (${repo.stargazers_count} stars)`);
    await sleep(200);
  }

  const [contributorsData, orgMembers] = await Promise.all([
    collectContributors(repos),
    getOrgMemberCount("scverse").catch(() => 0),
  ]);

  // Update contributor counts for each repo (excluding bots)
  repos.forEach((repo) => {
    repo.contributors_count =
      contributorsData.repoContributorCounts.get(repo.name) || 0;
  });

  repos.sort((a, b) => b.stargazers_count - a.stargazers_count);

  const validated = GitHubDataSchema.parse({
    organization: "scverse",
    total_repositories: repos.length,
    total_stars: repos.reduce((sum, r) => sum + r.stargazers_count, 0),
    total_stars_last_month: repos.reduce(
      (sum, r) => sum + r.stars_last_month,
      0,
    ),
    total_stars_last_year: repos.reduce((sum, r) => sum + r.stars_last_year, 0),
    unique_contributors: contributorsData.allContributors.size,
    organization_members: orgMembers,
    total_pull_requests_open: repos.reduce(
      (sum, r) => sum + r.pull_requests_open,
      0,
    ),
    total_pull_requests_closed: repos.reduce(
      (sum, r) => sum + r.pull_requests_closed,
      0,
    ),
    total_issues_open: repos.reduce((sum, r) => sum + r.issues_open, 0),
    total_issues_closed: repos.reduce((sum, r) => sum + r.issues_closed, 0),
    timestamp: new Date().toISOString(),
    repositories: repos,
  });

  await saveJson("github.json", validated);
  console.log(
    `Total stars: ${validated.total_stars}, Contributors: ${validated.unique_contributors}`,
  );
}
