const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { buildPropertyCollection } = require("./fixtures.cjs");

/**
 * 为单个用例启动独立真实 API：随机端口、临时目录、预置数据，不共享开发数据。
 * 先注册清理，即使启动失败或断言失败，也会结束子进程并删除临时文件。
 * @param {import('node:test').TestContext} t 当前用例的生命周期上下文。
 * @param {object} initial 可覆盖 properties / purchaseApplications 的独立前置数据。
 * @returns {Promise<object>} request、readDatabase 及基础地址，不 Mock HTTP 或持久化。
 */
async function createApiContext(t, initial = {}) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "qijing-endpoint-"),
  );
  const dataFile = path.join(directory, "data.json");
  let child;
  t.after(async () => {
    try {
      if (
        child &&
        child.pid &&
        child.exitCode === null &&
        child.signalCode === null
      ) {
        const exited = once(child, "exit");
        child.kill();
        const timeout = setTimeout(() => child.kill("SIGKILL"), 2000);
        try {
          await exited;
        } finally {
          clearTimeout(timeout);
        }
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  await fs.writeFile(
    dataFile,
    JSON.stringify({
      properties: buildPropertyCollection(),
      purchaseApplications: [],
      ...initial,
    }),
  );
  child = spawn(
    process.execPath,
    [path.resolve(__dirname, "../../../server.cjs")],
    {
      env: {
        ...process.env,
        MOCK_HOST: "127.0.0.1",
        MOCK_PORT: "0",
        MOCK_DATA_FILE: dataFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const baseUrl = await new Promise((resolve, reject) => {
    let stdout = "",
      stderr = "";
    const timer = setTimeout(
      () => fail(new Error(`API 启动超时：${stderr}`)),
      10000,
    );
    /** 启动失败时释放事件监听；资源清理交由当前测试的 after 回调。 */
    function fail(error) {
      cleanup();
      reject(error);
    }
    /** 就绪或失败后清理启动专用监听，防止用例留下挂起计时器。 */
    function cleanup() {
      clearTimeout(timer);
      child.off("error", fail);
      child.off("exit", onExit);
      child.stdout.off("data", onOutput);
      child.stderr.off("data", onErrorOutput);
    }
    /** 累积标准错误供启动失败诊断，不将业务请求数据打印到测试输出。 */
    function onErrorOutput(chunk) {
      stderr = (stderr + chunk).slice(-4000);
    }
    /** 提前退出也判为失败，不能将未启动的服务当作测试就绪。 */
    function onExit(code, signal) {
      fail(new Error(`API 启动前退出 (${code ?? signal})：${stderr}`));
    }
    /** 支持启动日志分块到达，以服务实际监听端口组成 API 地址。 */
    function onOutput(chunk) {
      stdout += chunk;
      const match = stdout.match(/listening on (\d+)/);
      if (match) {
        cleanup();
        resolve(`http://127.0.0.1:${match[1]}/api/v1`);
      }
    }
    child.once("error", fail);
    child.once("exit", onExit);
    child.stdout.on("data", onOutput);
    child.stderr.on("data", onErrorOutput);
  });

  /**
   * 发起真实 HTTP 请求，保留原始文本和响应头，可验证 204、错误结构及追踪字段。
   * rawBody / contentType 仅用于非法 JSON、体积限制等负面场景。
   */
  async function request(
    route,
    { method = "GET", payload, rawBody, contentType, headers = {} } = {},
  ) {
    const hasBody = payload !== undefined || rawBody !== undefined;
    const response = await fetch(baseUrl + route, {
      method,
      headers: {
        ...(hasBody
          ? { "Content-Type": contentType || "application/json" }
          : {}),
        ...headers,
      },
      ...(hasBody
        ? { body: rawBody !== undefined ? rawBody : JSON.stringify(payload) }
        : {}),
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      text,
      data: text ? JSON.parse(text) : null,
    };
  }
  /** 直接核对持久化文件，用于确认成功写入或失败时完全没有修改原数据。 */
  async function readDatabase() {
    return JSON.parse(await fs.readFile(dataFile, "utf8"));
  }
  return { request, readDatabase, baseUrl };
}
module.exports = { createApiContext };
