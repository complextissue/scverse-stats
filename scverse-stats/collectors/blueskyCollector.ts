import "dotenv/config";
import { BlueskyDataSchema } from "../types";
import { saveJson } from "../utils";

export async function collectBlueskyStats(): Promise<void> {
  console.log("Collecting Bluesky stats...");

  const profileUrl =
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=did:plc:43xl2lpdbllhfdpa2cuwaw6m";
  const response = await fetch(profileUrl);
  const profile = (await response.json()) as any;

  const validated = BlueskyDataSchema.parse({
    followers_count: profile.followersCount,
    handle: profile.handle,
    timestamp: new Date().toISOString(),
  });

  await saveJson("bluesky.json", validated);
  console.log(`Followers: ${validated.followers_count}`);
}
