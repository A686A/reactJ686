/**
 * 测试报告专用预加载器：只观察真实 HTTP 请求和断言，不替换其结果。
 * 仅由 generate-api-test-report.cjs 在设置报告目录后加载，不影响普通测试命令。
 */
const fs = require("node:fs");
const path = require("node:path");
const { AsyncLocalStorage } = require("node:async_hooks");
const testRunner = require("node:test");
const assertions = require("node:assert/strict");
const context = new AsyncLocalStorage();
const reportDirectory = process.env.QIJING_API_REPORT_DIRECTORY;
const root = path.resolve(__dirname, "..");
let registrationIndex = 0;

/** 保留 undefined 和正则等 JSON 原本无法表达的断言值，记录时立即复制以免后续修改。 */
function snapshot(value) {
  if (value === undefined) return { $type: "undefined" };
  if (value instanceof RegExp)
    return { $type: "RegExp", value: value.toString() };
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      item === undefined ? { $type: "undefined" } : item,
    ),
  );
}

/** 从调用栈定位真正的测试文件，避免把本预加载器的行号当成用例位置。 */
function callSite() {
  for (const line of new Error().stack.split("\n")) {
    const match = line.match(/(\/[^()]+\.test\.cjs):(\d+):(\d+)/);
    if (match)
      return {
        file: path.relative(root, match[1]),
        line: Number(match[2]),
        column: Number(match[3]),
      };
  }
  return null;
}

/**
 * 读取断言第一个参数的源码表达式，用于把实际值对应回 status、items、version 等字段。
 * 跳过嵌套括号和引号内的逗号，不执行源码或把响应值推断为预期值。
 */
function assertionExpression(site) {
  if (!site) return "断言";
  const source = fs.readFileSync(path.join(root, site.file), "utf8");
  const lines = source.split("\n");
  const offset =
    lines
      .slice(0, site.line - 1)
      .reduce((sum, line) => sum + line.length + 1, 0) +
    site.column -
    1;
  const start = source.indexOf("(", offset) + 1;
  let quote = null,
    escaped = false,
    depth = 0;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if ("\"'`".includes(character)) {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) depth++;
    else if (")]}".includes(character)) {
      if (depth === 0)
        return source.slice(start, index).replace(/\s+/g, " ").trim();
      depth--;
    } else if (character === "," && depth === 0)
      return source.slice(start, index).replace(/\s+/g, " ").trim();
  }
  return "断言";
}

if (reportDirectory) {
  // 记录 it/test 的运行上下文；describe 不计作测试，避免把10个分组误报为额外用例。
  const originals = { it: testRunner.it, test: testRunner.test };
  for (const name of Object.keys(originals)) {
    testRunner[name] = function registerCase(...arguments_) {
      const index = arguments_.findLastIndex(
        (argument) => typeof argument === "function",
      );
      const source = callSite();
      if (index < 0 || !source) return originals[name](...arguments_);
      const body = arguments_[index];
      const order = ++registrationIndex;
      arguments_[index] = async function recordCase(...parameters) {
        const record = {
          ...source,
          order,
          title: arguments_[0],
          passed: false,
          requests: [],
          assertions: [],
        };
        return context.run(record, async () => {
          try {
            const result = await body.apply(this, parameters);
            record.passed = true;
            return result;
          } catch (error) {
            record.error = error.message;
            throw error;
          } finally {
            fs.writeFileSync(
              path.join(reportDirectory, `${process.pid}-${order}.json`),
              JSON.stringify(record),
            );
          }
        });
      };
      return originals[name](...arguments_);
    };
  }

  // 预期取自测试本身传入断言的 expected 参数，而不是从 actual 响应复制。
  for (const name of ["equal", "deepEqual", "notEqual", "match", "ok"]) {
    const original = assertions[name];
    assertions[name] = function recordAssertion(...arguments_) {
      const record = context.getStore();
      if (!record) return original(...arguments_);
      const entry = {
        method: name,
        expression: assertionExpression(callSite()),
        actual: snapshot(arguments_[0]),
        expected: snapshot(name === "ok" ? true : arguments_[1]),
        passed: false,
      };
      record.assertions.push(entry);
      try {
        const result = original(...arguments_);
        entry.passed = true;
        return result;
      } catch (error) {
        entry.error = error.message;
        throw error;
      }
    };
  }

  const originalFetch = global.fetch;
  global.fetch = async function recordHttpRequest(input, options = {}) {
    const record = context.getStore();
    if (!record) return originalFetch(input, options);
    const url = new URL(String(input));
    // 仅采集测试服务的接口，过滤开发端口之外可能出现的其他网络调用。
    if (url.hostname !== "127.0.0.1" || !url.pathname.startsWith("/api/v1/"))
      return originalFetch(input, options);
    const entry = {
      method: options.method || "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: null,
      hasBody: options.body !== undefined,
    };
    if (options.body !== undefined) {
      try {
        entry.body = JSON.parse(options.body);
      } catch {
        entry.body = { rawText: String(options.body) };
      }
      // JSON证据保留超限测试的完整模拟请求；Markdown表格再按长度摘要展示。
      entry.bodyByteLength = Buffer.byteLength(String(options.body));
    }
    if (options.headers) entry.headers = snapshot(options.headers);
    record.requests.push(entry);
    try {
      const response = await originalFetch(input, options);
      const text = await response.clone().text();
      entry.response = {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        data: text ? JSON.parse(text) : null,
      };
      return response;
    } catch (error) {
      entry.error = error.message;
      throw error;
    }
  };

  // 记录独立测试真实使用的前置数据，不修改其内容或生命周期。
  const helpers = require("../mock/tests/helpers/apiTestContext.cjs");
  const {
    buildPropertyCollection,
  } = require("../mock/tests/helpers/fixtures.cjs");
  const originalContext = helpers.createApiContext;
  helpers.createApiContext = async function recordInitialData(
    test,
    initial = {},
  ) {
    const record = context.getStore();
    if (record)
      record.initialData = snapshot({
        properties: buildPropertyCollection(),
        purchaseApplications: [],
        ...initial,
      });
    return originalContext(test, initial);
  };
}
