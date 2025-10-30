import "dotenv/config";
import { ZulipDataSchema } from "../types";
import { saveJson } from "../utils";

const zulipInit = require("zulip-js");

export async function collectZulipStats(): Promise<void> {
  console.log("Collecting Zulip stats...");

  const config = {
    username: process.env.ZULIP_EMAIL,
    apiKey: process.env.ZULIP_API_KEY,
    realm: process.env.ZULIP_REALM,
  };

  const client = await zulipInit(config);
  const { members } = await client.users.retrieve();

  const activeUsers = members.filter((m: any) => !m.is_bot && m.is_active);

  // Get the subscribers to the "core" stream as a proxy for core team size
  const streams = await client.streams.retrieve()
  const coreStream = streams["streams"].filter((stream: any) => stream.name === "website")[0]
  const coreSubscribers = coreStream.subscriber_count || 0;

  const validated = ZulipDataSchema.parse({
    active_users: activeUsers.length,
    core_team_size: coreSubscribers,
    timestamp: new Date().toISOString(),
  });

  await saveJson("zulip.json", validated);
  console.log(`Active users: ${validated.active_users}`);
  console.log(`Core team size: ${validated.core_team_size}`);
}
