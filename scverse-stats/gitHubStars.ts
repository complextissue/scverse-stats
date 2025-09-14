import "dotenv/config";
import { promises as fs } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import { octokit } from "./octokit";

interface Repository {
  name: string;
  full_name: string;
  stargazers_count: number;
  stars_last_month: number;
  stars_last_year: number;
  description: string | null;
  html_url: string;
  language: string | null;
  updated_at: string;
  contributors_count: number;
  star_chart_url: string;
}

interface Config {
  core_packages: string[];
}

interface StarHistoryPoint {
  date: string;
  stars: number;
}

interface Stats {
  organization: string;
  total_repositories: number;
  total_stars: number;
  total_stars_last_month: number;
  total_stars_last_year: number;
  unique_contributors: number;
  organization_members: number;
  timestamp: string;
  repositories: Repository[];
}

async function generateStarChart(
  repo: Repository,
  starHistory: StarHistoryPoint[],
): Promise<void> {
  const chartCanvas = new ChartJSNodeCanvas({
    width: 800,
    height: 400,
    backgroundColour: "white",
  });

  const labels = starHistory.map((point) => {
    const date = new Date(point.date);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  });

  const data = starHistory.map((point) => point.stars);

  const chartConfig = {
    type: "line" as const,
    data: {
      labels: labels,
      datasets: [
        {
          label: "Stars",
          data: data,
          borderColor: "rgb(75, 192, 192)",
          backgroundColor: "rgba(75, 192, 192, 0.1)",
          tension: 0.1,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${repo.name} - Star History (${repo.stargazers_count} total stars)`,
          font: {
            size: 16,
          },
        },
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Stars",
          },
        },
        x: {
          title: {
            display: true,
            text: "Date",
          },
        },
      },
    },
  };

  const imageBuffer = await chartCanvas.renderToBuffer(chartConfig);

  // Ensure output/stars directory exists
  const starsDir = join(process.cwd(), "output", "stars");
  await fs.mkdir(starsDir, { recursive: true });

  // Save chart as PNG
  const chartPath = join(starsDir, `${repo.name}.png`);
  await fs.writeFile(chartPath, imageBuffer);

  console.log(`  📊 Chart saved: ${chartPath}`);
}

async function getStarHistory(
  owner: string,
  repo: string,
  createdAt: string,
): Promise<StarHistoryPoint[]> {
  const history: StarHistoryPoint[] = [];
  const createdDate = new Date(createdAt);
  const now = new Date();

  // Create 3-month intervals from creation date to now
  const intervals: Date[] = [];
  let currentDate = new Date(createdDate);

  while (currentDate <= now) {
    intervals.push(new Date(currentDate));
    currentDate.setMonth(currentDate.getMonth() + 3);
  }

  // Add current date as final point
  if (intervals[intervals.length - 1].getTime() !== now.getTime()) {
    intervals.push(now);
  }

  let totalStars = 0;

  for (let i = 0; i < intervals.length; i++) {
    const date = intervals[i];

    try {
      // For the first point (creation), stars should be 0
      if (i === 0) {
        history.push({
          date: date.toISOString(),
          stars: 0,
        });
        continue;
      }

      // Get stargazers up to this date
      let page = 1;
      let starsAtDate = 0;
      let hasMore = true;

      while (hasMore) {
        try {
          const response = await octokit.rest.activity.listStargazersForRepo({
            owner,
            repo,
            per_page: 100,
            page,
            headers: {
              Accept: "application/vnd.github.star+json",
            },
          });

          if (response.data.length === 0) {
            hasMore = false;
            break;
          }

          // Count stars up to the target date
          for (const star of response.data) {
            if (star.starred_at) {
              const starredAt = new Date(star.starred_at);
              if (starredAt <= date) {
                starsAtDate++;
              } else {
                hasMore = false;
                break;
              }
            }
          }

          page++;

          // Add delay to respect rate limits
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error: any) {
          if (error.status === 422) {
            // Repository doesn't have star timestamps, use approximation
            console.warn(
              `  Cannot get star history for ${repo}, using approximation`,
            );
            // Simple linear approximation based on current stars and age
            const repoAge = now.getTime() - createdDate.getTime();
            const pointAge = date.getTime() - createdDate.getTime();
            const currentStars = await getCurrentStarCount(owner, repo);
            starsAtDate = Math.floor((currentStars * pointAge) / repoAge);
            hasMore = false;
          } else {
            console.warn(
              `  Error fetching star history for ${repo}: ${error.message}`,
            );
            hasMore = false;
          }
        }
      }

      history.push({
        date: date.toISOString(),
        stars: starsAtDate,
      });
    } catch (error: any) {
      console.warn(
        `  Error processing date ${date.toISOString()} for ${repo}: ${error.message}`,
      );
    }
  }

  return history;
}

async function getCurrentStarCount(
  owner: string,
  repo: string,
): Promise<number> {
  try {
    const response = await octokit.rest.repos.get({ owner, repo });
    return response.data.stargazers_count || 0;
  } catch (error) {
    return 0;
  }
}

async function fetchScverseStats(): Promise<void> {
  try {
    // Load configuration
    console.log("Loading configuration...");
    const configPath = join(process.cwd(), "config", "config.yaml");
    const configFile = await fs.readFile(configPath, "utf8");
    const config = yaml.load(configFile) as Config;

    console.log(`Core packages: ${config.core_packages.join(", ")}`);
    console.log("Fetching repositories for scverse organization...");

    let allRepos: Repository[] = [];

    // Fetch only core package repositories
    for (const packageName of config.core_packages) {
      console.log(`Fetching repository info for ${packageName}...`);

      try {
        // Get repository information
        const { data: repo } = await octokit.rest.repos.get({
          owner: "scverse",
          repo: packageName,
        });

        console.log(`  Fetching contributors for ${repo.name}...`);
        let contributorsCount = 0;

        try {
          // Get contributors count (first page to get total count from headers)
          const contributorsResponse =
            await octokit.rest.repos.listContributors({
              owner: "scverse",
              repo: repo.name,
              per_page: 1,
              page: 1,
            });

          // Parse the Link header to get the total number of contributors
          contributorsCount = 1;
          if (contributorsResponse.headers.link) {
            const linkHeader = contributorsResponse.headers.link;
            const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
            if (lastPageMatch) {
              contributorsCount = parseInt(lastPageMatch[1]);
            }
          } else if (contributorsResponse.data.length === 0) {
            contributorsCount = 0;
          }

          // Add delay to respect GitHub API rate limits
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error: any) {
          console.warn(
            `  Could not fetch contributors for ${repo.name}: ${error.message}`,
          );
          contributorsCount = 0;
        }

        // Fetch star history for the last month and year
        console.log(`  Fetching star history for ${repo.name}...`);
        let starsLastMonth = 0;
        let starsLastYear = 0;

        try {
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

          // Get stargazers with timestamps (this gives us star dates)
          let page = 1;
          let allStargazers: any[] = [];

          while (true) {
            const stargazersResponse =
              await octokit.rest.activity.listStargazersForRepo({
                owner: "scverse",
                repo: repo.name,
                per_page: 100,
                page: page,
                headers: {
                  Accept: "application/vnd.github.v3.star+json", // This includes timestamps
                },
              });

            if (stargazersResponse.data.length === 0) break;

            allStargazers.push(...stargazersResponse.data);

            // If we got less than 100, we've reached the end
            if (stargazersResponse.data.length < 100) break;

            page++;

            // Add delay to respect rate limits
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          // Count stars in the last month and year
          for (const star of allStargazers) {
            const starDate = new Date(star.starred_at);
            if (starDate >= oneMonthAgo) {
              starsLastMonth++;
            }
            if (starDate >= oneYearAgo) {
              starsLastYear++;
            }
          }
        } catch (error: any) {
          console.warn(
            `  Could not fetch star history for ${repo.name}: ${error.message}`,
          );
        }

        const repoData = {
          name: repo.name,
          full_name: repo.full_name,
          stargazers_count: repo.stargazers_count || 0,
          stars_last_month: starsLastMonth,
          stars_last_year: starsLastYear,
          description: repo.description,
          html_url: repo.html_url,
          language: repo.language || null,
          updated_at: repo.updated_at || "",
          contributors_count: contributorsCount,
          star_chart_url: `https://scverse-stats.complextissue.com/stars/${repo.name}.png`,
        };

        // Generate star history chart
        console.log(`  📊 Generating star history chart for ${repo.name}...`);
        try {
          const starHistory = await getStarHistory(
            "scverse",
            repo.name,
            repo.created_at,
          );
          await generateStarChart(repoData, starHistory);
        } catch (error: any) {
          console.warn(
            `  Could not generate chart for ${repo.name}: ${error.message}`,
          );
        }

        allRepos.push(repoData);
      } catch (error: any) {
        console.warn(
          `Could not fetch repository ${packageName}: ${error.message}`,
        );
      }

      // Add delay to respect GitHub API rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Fetch organization members
    console.log("\nFetching organization members...");
    let organizationMembers = 0;
    try {
      const membersResponse = await octokit.rest.orgs.listMembers({
        org: "scverse",
        per_page: 1,
        page: 1,
      });

      if (membersResponse.headers.link) {
        const linkHeader = membersResponse.headers.link;
        const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (lastPageMatch) {
          organizationMembers = parseInt(lastPageMatch[1]);
        }
      } else {
        organizationMembers = membersResponse.data.length;
      }
    } catch (error: any) {
      console.warn(`Could not fetch organization members: ${error.message}`);
    }

    // Fetch all unique contributors across core packages
    console.log("Calculating unique contributors for core packages...");
    const allContributors = new Set<string>();

    for (const repo of allRepos) {
      if (repo.contributors_count > 0) {
        console.log(`  Processing contributors for ${repo.name}...`);
        try {
          let page = 1;
          let hasMore = true;

          while (hasMore) {
            const contributorsResponse =
              await octokit.rest.repos.listContributors({
                owner: "scverse",
                repo: repo.name,
                per_page: 100,
                page: page,
              });

            contributorsResponse.data.forEach((contributor) => {
              if (contributor.login) {
                allContributors.add(contributor.login);
              }
            });

            hasMore = contributorsResponse.data.length === 100;
            page++;

            // Add delay to respect GitHub API rate limits
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (error: any) {
          console.warn(
            `Could not fetch detailed contributors for ${repo.name}: ${error.message}`,
          );
        }
      }
    }

    // Calculate totals
    const totalStars = allRepos.reduce(
      (sum, repo) => sum + repo.stargazers_count,
      0,
    );
    const totalStarsLastMonth = allRepos.reduce(
      (sum, repo) => sum + repo.stars_last_month,
      0,
    );
    const totalStarsLastYear = allRepos.reduce(
      (sum, repo) => sum + repo.stars_last_year,
      0,
    );

    // Sort repositories by star count (descending)
    allRepos.sort((a, b) => b.stargazers_count - a.stargazers_count);

    const stats: Stats = {
      organization: "scverse",
      total_repositories: allRepos.length,
      total_stars: totalStars,
      total_stars_last_month: totalStarsLastMonth,
      total_stars_last_year: totalStarsLastYear,
      unique_contributors: allContributors.size,
      organization_members: organizationMembers,
      timestamp: new Date().toISOString(),
      repositories: allRepos,
    };

    // Write to stats.json file
    const outputDir = join(process.cwd(), "output");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = join(outputDir, "stats.json");
    await fs.writeFile(outputPath, JSON.stringify(stats, null, 2));

    console.log(`\n📊 Scverse Core Packages Stats:`);
    console.log(`   Core packages: ${stats.total_repositories}`);
    console.log(`   Total stars: ${stats.total_stars}`);
    console.log(`   Stars gained last month: ${stats.total_stars_last_month}`);
    console.log(`   Stars gained last year: ${stats.total_stars_last_year}`);
    console.log(`   Unique contributors: ${stats.unique_contributors}`);
    console.log(`   Organization members: ${stats.organization_members}`);
    console.log(`   Generated at: ${stats.timestamp}`);
    console.log(`   Output saved to: ${outputPath}`);

    // Show all core packages sorted by stars
    console.log(`\n⭐ Core packages by stars:`);
    allRepos.forEach((repo, index) => {
      console.log(
        `   ${index + 1}. ${repo.name} - ${repo.stargazers_count} stars (+${repo.stars_last_month} last month, +${repo.stars_last_year} last year) (${repo.contributors_count} contributors)`,
      );
    });
  } catch (error: any) {
    console.error("Error fetching scverse stats:", error);

    // Handle GitHub API rate limiting
    if (
      error.status === 403 &&
      error.response?.headers?.["x-ratelimit-remaining"] === "0"
    ) {
      const resetTime = error.response.headers["x-ratelimit-reset"];
      const resetDate = new Date(parseInt(resetTime) * 1000);
      console.log(`Rate limit exceeded. Resets at: ${resetDate.toISOString()}`);
    }

    process.exit(1);
  }
}

// Run the script
fetchScverseStats().catch(console.error);
