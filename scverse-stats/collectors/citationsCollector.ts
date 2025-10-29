import "dotenv/config";
import { CitationsDataSchema } from "../types";
import { saveJson, sleep } from "../utils";

const citationIds = [
  "37037904", // NBT correspondence
  "38509327", // SpatialData
  "29409532", // Scanpy
  "35102346", // Squidpy
];

export async function collectCitationStats(): Promise<void> {
  console.log("Collecting citations...");

  const papers: Array<{ pmid: string; citation_count: number }> = [];
  let totalCitations = 0;

  for (const pmid of citationIds) {
    const citationUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/MED/${pmid}/citations?page=1&pageSize=1&format=json`;

    const response = await fetch(citationUrl);
    const data = (await response.json()) as any;
    const citationCount = data.hitCount || 0;

    papers.push({
      pmid,
      citation_count: citationCount,
    });

    totalCitations += citationCount;
    console.log(`  PMID ${pmid}: ${citationCount} citations`);

    await sleep(100); // Be nice to the API
  }

  const validated = CitationsDataSchema.parse({
    papers,
    total_citation_count: totalCitations,
    timestamp: new Date().toISOString(),
  });

  await saveJson("citations.json", validated);
  console.log(`Total citations: ${validated.total_citation_count}`);
}
