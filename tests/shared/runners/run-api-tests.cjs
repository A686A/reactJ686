const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { getApiTestFiles } = require("./apiTestFiles.cjs");

/**
 * 按业务模块或测试类型选择用例；将真实Node测试进程的退出状态传回npm/CI。
 * 示例：--module property-management；--kind flows；两者可组合。
 */
function main() {
  const options = {};
  const arguments_ = process.argv.slice(2);
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index],
      value = arguments_[index + 1];
    if (!["--module", "--kind"].includes(flag) || !value)
      throw new Error(
        "参数格式：--module <模块名> 或 --kind <endpoints|flows>",
      );
    options[flag === "--module" ? "moduleName" : "kind"] = value;
  }
  const files = getApiTestFiles(options);
  const result = spawnSync(process.execPath, ["--test", ...files], {
    cwd: path.resolve(__dirname, "../../.."),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
