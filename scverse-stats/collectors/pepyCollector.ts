import "dotenv/config";
import { promises as fs } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import { PepyDataSchema, PepyPackageSchema } from "../types";
import { saveJson, sleep } from "../utils";

const PEPY_BASE = "https://api.pepy.tech/api/v2/projects";

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/_/g, "-");
}

export async function collectPepyStats(): Promise<void> {
  console.log("Collecting PEPY download stats...");

  const configPath = join(process.cwd(), "config", "config.yaml");
  const config = yaml.load(await fs.readFile(configPath, "utf8")) as {
    core_packages: string[];
  };

  const packages: any[] = [];
  const perPackage30DayAvg: {
    id: string;
    total_30_days: number;
    avg_per_day: number;
  }[] = [];

  const apiKey = process.env.PEPY_API_KEY;

  if (!apiKey) {
    console.log("PEPY_API_KEY not set — skipping pepy collector");
    return;
  }

  // PEPY free tier: 10 requests/minute -> wait 6s between requests
  const delayMs = 6000;

  for (const pkg of config.core_packages) {
    const project = normalizeName(pkg);
    const url = `${PEPY_BASE}/${encodeURIComponent(project)}`;

    try {
      const resp = await fetch(url, {
        headers: { "X-API-Key": apiKey },
      });

      if (resp.status === 404) {
        console.log(`  ${project}: not found`);
        packages.push({
          id: project,
          total_downloads: 0,
          versions: [],
          downloads: {},
        });
      } else if (resp.status === 401) {
        console.log("  PEPY API key invalid (401)");
        return;
      } else if (resp.status === 429) {
        console.log("  Rate limit exceeded (429) — stopping");
        break;
      } else if (!resp.ok) {
        console.log(`  ${project}: request failed (${resp.status})`);
        packages.push({
          id: project,
          total_downloads: 0,
          versions: [],
          downloads: {},
        });
      } else {
        const body = (await resp.json()) as any;
        try {
          const validated = PepyPackageSchema.parse({
            id: body.id || project,
            total_downloads: body.total_downloads || 0,
            versions: Array.isArray(body.versions) ? body.versions : [],
            downloads: body.downloads || {},
          });

          // Compute last 30 days total (combine across versions)
          const downloadsObj = validated.downloads || {};
          const sortedDates = Object.keys(downloadsObj).sort().reverse();
          const today = new Date();
          let total30 = 0;
          let countedDays = 0;

          for (const dateStr of sortedDates) {
            if (countedDays >= 30) break;
            const d = new Date(dateStr + "T00:00:00Z");
            const diffDays = Math.floor(
              (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
            );
            if (diffDays < 0) continue; // future date
            if (diffDays >= 30) continue; // older than 30 days

            const perVersion = downloadsObj[dateStr] || {};
            const dayTotal = Object.values(perVersion).reduce(
              (s: number, v: any) => s + (Number(v) || 0),
              0,
            );
            total30 += dayTotal;
            countedDays++;
          }

          const avgPerDay = countedDays > 0 ? total30 / countedDays : 0;
          perPackage30DayAvg.push({
            id: validated.id,
            total_30_days: total30,
            avg_per_day: avgPerDay,
          });

          packages.push(validated);
          console.log(
            `  ${project}: ${validated.total_downloads} downloads, 30-day avg ${avgPerDay.toFixed(1)}`,
          );
        } catch (err) {
          console.log(`  ${project}: validation failed`);
          packages.push({
            id: project,
            total_downloads: body.total_downloads || 0,
            versions: body.versions || [],
            downloads: body.downloads || {},
          });
        }
      }
    } catch (err) {
      console.log(`  ${project}: fetch error`);
      packages.push({
        id: project,
        total_downloads: 0,
        versions: [],
        downloads: {},
      });
    }

    await sleep(delayMs);
  }

  const total = packages.reduce((s, p) => s + (p.total_downloads || 0), 0);
  // Combine the per-package averages into overall metrics
  const combinedTotal30 = perPackage30DayAvg.reduce(
    (s, p) => s + p.total_30_days,
    0,
  );
  const combinedAvgDaily = perPackage30DayAvg.reduce(
    (s, p) => s + p.avg_per_day,
    0,
  );

  const validatedAll = PepyDataSchema.parse({
    packages,
    total_downloads: total,
    timestamp: new Date().toISOString(),
  });

  const out = {
    ...validatedAll,
    computed: {
      per_package_30_day: perPackage30DayAvg,
      combined_total_30_days: combinedTotal30,
      combined_avg_daily: combinedAvgDaily,
    },
  };

  await saveJson("pepy.json", out);
  console.log(
    `Total pepy downloads: ${validatedAll.total_downloads}, combined 30-day avg daily: ${combinedAvgDaily.toFixed(1)}`,
  );
}
