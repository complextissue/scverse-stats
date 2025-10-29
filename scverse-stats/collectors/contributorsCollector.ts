import "dotenv/config";
import { promises as fs } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import { octokit } from "../octokit";
import { saveJson, sleep } from "../utils";
import { z } from "zod";

const ContributorSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().url(),
  html_url: z.string().url(),
  contributions: z.number(),
});

const ContributorsDataSchema = z.object({
  total_contributors: z.number(),
  contributors: z.array(ContributorSchema),
  timestamp: z.string(),
});

type Contributor = z.infer<typeof ContributorSchema>;

export async function collectContributorsData(): Promise<void> {
  console.log("Collecting contributors data...");

  const configPath = join(process.cwd(), "config", "config.yaml");
  const config = yaml.load(await fs.readFile(configPath, "utf8")) as { core_packages: string[] };

  const contributorsMap = new Map<string, Contributor>();

  for (const packageName of config.core_packages) {
    let page = 1;
    
    while (page < 50) { // Limit to avoid excessive API calls
      const { data: contributors } = await octokit.rest.repos.listContributors({
        owner: "scverse",
        repo: packageName,
        per_page: 100,
        page,
      });

      if (contributors.length === 0) break;

      for (const contributor of contributors) {
        if (!contributor.login) continue;
        
        // Filter out bots
        if (contributor.login.endsWith('[bot]')) continue;

        const existing = contributorsMap.get(contributor.login);
        
        if (existing) {
          // Add contributions from this repo
          existing.contributions += contributor.contributions || 0;
        } else {
          // Fetch detailed user info for name
          try {
            const { data: userInfo } = await octokit.rest.users.getByUsername({
              username: contributor.login,
            });

            contributorsMap.set(contributor.login, {
              login: contributor.login,
              name: userInfo.name || contributor.login,
              avatar_url: contributor.avatar_url || "",
              html_url: contributor.html_url || `https://github.com/${contributor.login}`,
              contributions: contributor.contributions || 0,
            });

            await sleep(100); // Rate limit protection
          } catch (error) {
            // Fallback if user info fetch fails
            contributorsMap.set(contributor.login, {
              login: contributor.login,
              name: contributor.login,
              avatar_url: contributor.avatar_url || "",
              html_url: contributor.html_url || `https://github.com/${contributor.login}`,
              contributions: contributor.contributions || 0,
            });
          }
        }
      }

      if (contributors.length < 100) break;
      page++;
      await sleep(200);
    }
    
    console.log(`  ${packageName} (${contributorsMap.size} unique contributors so far)`);
  }

  // Convert to array and sort by contributions
  const contributorsArray = Array.from(contributorsMap.values())
    .sort((a, b) => b.contributions - a.contributions);

  const validated = ContributorsDataSchema.parse({
    total_contributors: contributorsArray.length,
    contributors: contributorsArray,
    timestamp: new Date().toISOString(),
  });

  await saveJson("contributors.json", validated);
  console.log(`Total unique contributors: ${validated.total_contributors}`);
}
