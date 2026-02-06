import { getVersions, getLatestVersion } from "fast-npm-meta";

export interface PackageVersionInfo {
  latest: string;
  versions: string[];
  time?: Record<string, string>;
}

const cache = new Map<string, { data: PackageVersionInfo; expires: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function getPackageMetaWithCache(
  packageName: string,
): Promise<PackageVersionInfo | null> {
  const cached = cache.get(packageName);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  try {
    const [versionsMeta, latestMeta] = await Promise.all([
      getVersions(packageName),
      getLatestVersion(packageName),
    ]);

    if (!versionsMeta || !latestMeta) return null;

    const data: PackageVersionInfo = {
      latest: latestMeta.version || "",
      versions: Object.keys(versionsMeta.versions || {}),
      // fast-npm-meta doesn't seem to expose time in the same way, but we can live without it for now
      // or check if it exists in versionsMeta
    };

    cache.set(packageName, {
      data,
      expires: Date.now() + CACHE_TTL,
    });

    return data;
  } catch (error) {
    console.error(`Failed to fetch meta for ${packageName}:`, error);
    return null;
  }
}
