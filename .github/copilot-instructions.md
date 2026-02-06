# Copilot Instructions for package-check

## chat 要求

- 请使用中文回答

## 项目需求

- 这是一个`vsCode`扩展插件项目。
- 这是一个用于检查 `package.json` 文件中依赖项版本的项目。
- 需要可视化，当在`package.json`中检测到过时的依赖项版本时，能够高亮显示并提供更新建议。
- 需要提供的建议包括 主要版本更新（major）、次要版本更新（minor）和补丁版本更新（patch）。
- 需要支持 `pnpm-workspace.yaml` 的 `catalog` 配置。基于`pnpm-workspace.yaml`中允许的`packages`路径，当打开了一个工作区时，能够自动检测并检查所有相关的`package.json`文件。
- 使用 `https://github.com/antfu/fast-npm-meta` 这个包获取`npm`元数据，需要支持缓存 (我不确定它是否已经实现了缓存)。

## 代码风格

- 请使用 `typescript`编写代码。
- 请使用 `tsdown` 构建和开发。
