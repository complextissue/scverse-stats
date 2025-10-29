import "dotenv/config";
import { collectGitHubStats } from "./collectors/gitHubCollector";
import { collectZulipStats } from "./collectors/zulipCollector";
import { collectBlueskyStats } from "./collectors/blueskyCollector";
import { collectEcosystemStats } from "./collectors/ecosystemCollector";
import { collectCitationStats } from "./collectors/citationsCollector";
import { collectContributorsData } from "./collectors/contributorsCollector";
import { combineStats } from "./combiner";

async function main() {
  console.log("Collecting scverse statistics...\n");

  await Promise.all([
    collectGitHubStats().catch((e: any) =>
      console.error("GitHub failed:", e.message),
    ),
    collectZulipStats().catch((e: any) => console.error("Zulip failed:", e.message)),
    collectBlueskyStats().catch((e: any) =>
      console.error("Bluesky failed:", e.message),
    ),
    collectEcosystemStats().catch((e: any) =>
      console.error("Ecosystem failed:", e.message),
    ),
    collectCitationStats().catch((e: any) =>
      console.error("Citations failed:", e.message),
    ),
    collectContributorsData().catch((e: any) =>
      console.error("Contributors failed:", e.message),
    ),
  ]);

  console.log("\nCombining statistics...");
  await combineStats();

  console.log("Done!");
}

main().catch(console.error);
