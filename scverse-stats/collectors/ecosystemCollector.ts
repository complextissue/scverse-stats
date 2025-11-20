import "dotenv/config";
import { EcosystemDataSchema, EcosystemPackageSchema } from "../types";
import { saveJson } from "../utils";

export async function collectEcosystemStats(): Promise<void> {
  console.log("Collecting ecosystem packages...");

  const ecosystemUrl = "https://scverse.org/ecosystem-packages/packages.json";
  const response = await fetch(ecosystemUrl);
  const packages = (await response.json()) as any[];

  const validatedPackages = packages
    .map((pkg) => {
      try {
        return EcosystemPackageSchema.parse({
          name: pkg.name,
          description: pkg.description || null,
          project_home: pkg.project_home,
          documentation_home: pkg.documentation_home || null,
        });
      } catch {
        return null;
      }
    })
    .filter((pkg) => pkg !== null);

  const validated = EcosystemDataSchema.parse({
    total_packages: validatedPackages.length,
    packages: validatedPackages,
    timestamp: new Date().toISOString(),
  });

  await saveJson("ecosystem.json", validated);
  console.log(`Total packages: ${validated.total_packages}`);
}
