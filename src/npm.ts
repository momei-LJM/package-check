import * as vscode from "vscode";
import { getVersions, getLatestVersion } from "fast-npm-meta";

export interface PackageVersionInfo {
  latest: string;
  versions: string[];
  time?: Record<string, string>;
}

export interface CacheEntry {
  data: PackageVersionInfo;
  expires: number;
}

// 内存缓存
const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// VSCode 全局状态（持久化缓存）
let globalState: vscode.Memento | undefined;

export function setGlobalState(state: vscode.Memento) {
  globalState = state;
}

// 从持久化缓存获取
function getFromPersistentCache(packageName: string): PackageVersionInfo | null {
  if (!globalState) return null;

  const cached = globalState.get<CacheEntry>(`package-meta-${packageName}`);
  if (cached && cached.expires > Date.now()) {
    // 确保 latest 是字符串类型
    if (cached.data && typeof cached.data.latest === "string") {
      return cached.data;
    }
  }
  return null;
}

// 保存到持久化缓存
function saveToPersistentCache(packageName: string, data: PackageVersionInfo) {
  if (!globalState) return;

  globalState.update(`package-meta-${packageName}`, {
    data,
    expires: Date.now() + CACHE_TTL,
  });
}

// 带持久化缓存的获取函数
// 返回：[立即可用的缓存数据, 获取最新数据的 Promise]
// 调用者可以先用缓存数据显示 UI，同时在后台更新最新数据
export function getPackageMetaWithCache(
  packageName: string,
): Promise<PackageVersionInfo | null> {
  // 1. 先检查内存缓存
  const memoryCached = memoryCache.get(packageName);
  if (memoryCached && memoryCached.expires > Date.now()) {
    // 确保 latest 是字符串类型
    if (memoryCached.data && typeof memoryCached.data.latest === "string") {
      return Promise.resolve(memoryCached.data);
    }
  }

  // 2. 检查持久化缓存
  const persistentCached = getFromPersistentCache(packageName);
  if (persistentCached) {
    // 更新内存缓存
    memoryCache.set(packageName, {
      data: persistentCached,
      expires: Date.now() + CACHE_TTL,
    });
    return Promise.resolve(persistentCached);
  }

  // 3. 从网络获取最新数据
  return fetchAndCache(packageName);
}

// 刷新缓存（后台调用）
export function refreshPackageMeta(
  packageName: string,
): Promise<PackageVersionInfo | null> {
  return fetchAndCache(packageName);
}

// 从网络获取并缓存
async function fetchAndCache(
  packageName: string,
): Promise<PackageVersionInfo | null> {
  try {
    const [versionsMeta, latestMeta] = await Promise.all([
      getVersions(packageName),
      getLatestVersion(packageName),
    ]);

    if (!versionsMeta || !latestMeta) return null;

    const data: PackageVersionInfo = {
      latest: latestMeta.version || "",
      versions: Object.keys(versionsMeta.versions || {}),
    };

    // 保存到内存缓存
    memoryCache.set(packageName, {
      data,
      expires: Date.now() + CACHE_TTL,
    });

    // 保存到持久化缓存
    saveToPersistentCache(packageName, data);

    return data;
  } catch (error) {
    console.error(`Failed to fetch meta for ${packageName}:`, error);
    return null;
  }
}
