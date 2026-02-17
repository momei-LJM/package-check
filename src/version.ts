import semver from "semver";

export type UpdateType = "major" | "minor" | "patch" | null;

export interface UpdateSuggestion {
  current: string;
  latest: string;
  type: UpdateType; // 用于决定显示颜色
  catalog?: string; // catalog 模式下的目录名
}

export function getUpdateSuggestion(
  currentRange: string,
  latest: string,
): UpdateSuggestion | null {
  // 确保 latest 是字符串
  if (!latest || typeof latest !== "string") return null;

  // 提取基准版本
  const current = semver.minVersion(currentRange)?.version;
  if (!current || typeof current !== "string") return null;

  // 如果没有更新，返回 null
  if (!semver.gt(latest, current)) {
    return null;
  }

  // 计算版本跨度类型
  const diff = semver.diff(current, latest);
  let type: UpdateType = null;
  if (diff === "major" || diff === "premajor") {
    type = "major";
  } else if (diff === "minor" || diff === "preminor") {
    type = "minor";
  } else if (diff === "patch" || diff === "prepatch" || diff === "prerelease") {
    type = "patch";
  }

  return {
    current: currentRange,
    latest,
    type,
  };
}
