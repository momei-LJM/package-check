import semver from "semver";

export type UpdateType = "major" | "minor" | "patch" | "latest" | null;

export interface UpdateSuggestion {
  current: string;
  latest: string;
  major?: string;
  minor?: string;
  patch?: string;
}

export function getUpdateSuggestion(
  currentRange: string,
  versions: string[],
  latest: string,
): UpdateSuggestion | null {
  // Clean range
  const current = semver.minVersion(currentRange)?.version;
  if (!current) return null;

  const suggestion: UpdateSuggestion = {
    current: currentRange,
    latest: latest,
  };

  const sortedVersions = versions
    .filter((v) => semver.valid(v) && !semver.prerelease(v))
    .sort(semver.compare);

  const patches = sortedVersions.filter((v) =>
    semver.satisfies(v, `~${current}`),
  );
  const minors = sortedVersions.filter((v) =>
    semver.satisfies(v, `^${current}`),
  );

  const latestPatch = patches[patches.length - 1];
  const latestMinor = minors[minors.length - 1];

  if (latestPatch && semver.gt(latestPatch, current)) {
    suggestion.patch = latestPatch;
  }

  if (latestMinor && semver.gt(latestMinor, current)) {
    suggestion.minor = latestMinor;
  }

  if (latest && semver.gt(latest, current)) {
    suggestion.major = latest;
  }

  // If no updates available
  if (!suggestion.patch && !suggestion.minor && !suggestion.major) {
    return null;
  }

  return suggestion;
}
