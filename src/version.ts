import semver from "semver";

export type UpdateType = "major" | "minor" | "patch" | "latest" | null;

export interface UpdateSuggestion {
  current: string;
  latest: string;
  major?: string;
  minor?: string;
  patch?: string;
  catalog?: string;
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

  console.log(`[getUpdateSuggestion] ${currentRange} (${current}): latest=${latest}, latestMinor=${latestMinor}, latestPatch=${latestPatch}`);

  if (latest && semver.gt(latest, current)) {
    const diff = semver.diff(current, latest);

    // 我们总是记录绝对最新的版本到其分类中
    if (diff === "major" || diff === "premajor") {
      suggestion.major = latest;
    } else if (diff === "minor" || diff === "preminor") {
      suggestion.minor = latest;
    } else if (diff === "patch" || diff === "prepatch" || diff === "prerelease") {
      suggestion.patch = latest;
    }

    // 无论绝对最新是什么版本，我们都尝试补全当前范围内的“最安全”更高版本
    // 补丁更新 (Tilde range)
    const latestPatch = patches[patches.length - 1];
    if (latestPatch && semver.gt(latestPatch, current)) {
      suggestion.patch = latestPatch;
    }

    // 次要更新 (Caret range)
    const latestMinor = minors[minors.length - 1];
    if (latestMinor && semver.gt(latestMinor, current)) {
      // 只有当最新次要版本 比 我们已找到的补丁更新 还要新时才记录
      if (!suggestion.patch || semver.gt(latestMinor, suggestion.patch)) {
        suggestion.minor = latestMinor;
      }
    }
  }

  // If no updates available
  if (!suggestion.patch && !suggestion.minor && !suggestion.major) {
    return null;
  }

  return suggestion;
}
