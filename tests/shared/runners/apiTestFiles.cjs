const fs = require("node:fs");
const path = require("node:path");
const projectRoot = path.resolve(__dirname, "../../..");
const testRoot = path.join(projectRoot, "tests");
const modules = ["property-management", "purchase-approval", "shared"];
const kinds = ["endpoints", "flows"];

/** 递归查找测试文件，排序后返回；公共辅助文件没有 .test.cjs 后缀，不会被当成用例。 */
function collectTestFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory()
        ? collectTestFiles(absolute)
        : entry.name.endsWith(".test.cjs")
          ? [absolute]
          : [];
    });
}

/**
 * 普通测试命令和报告生成共用同一发现规则，防止目录迁移后漏跑用例。
 * @param {object} options 可按 moduleName（业务模块）或 kind（endpoints/flows）筛选。
 * @returns {string[]} 相对于项目根目录的测试路径；空结果或非法筛选会明确报错。
 */
function getApiTestFiles({ moduleName, kind } = {}) {
  if (moduleName && !modules.includes(moduleName))
    throw new Error(`未知测试模块：${moduleName}，支持 ${modules.join(", ")}`);
  if (kind && !kinds.includes(kind))
    throw new Error(`未知测试类型：${kind}，支持 ${kinds.join(", ")}`);
  const files = collectTestFiles(testRoot)
    .filter((file) => {
      const segments = path.relative(testRoot, file).split(path.sep);
      return (
        (!moduleName || segments[0] === moduleName) &&
        (!kind || segments[1] === kind)
      );
    })
    .map((file) => path.relative(projectRoot, file).split(path.sep).join("/"));
  if (!files.length)
    throw new Error("没有找到匹配的API测试，拒绝以零用例运行成功。");
  return files;
}
module.exports = { getApiTestFiles };
