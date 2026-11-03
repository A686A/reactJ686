/** 运行全部 API 测试，生成可核对的五列表格及真实请求、响应和断言证据。 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const groups = [
  ["health.get.test.cjs", "HEALTH", "服务健康检查"],
  ["properties.list.test.cjs", "PROP-LIST", "房源列表"],
  ["properties.create.test.cjs", "PROP-CREATE", "新增房源"],
  ["properties.detail.test.cjs", "PROP-DETAIL", "房源详情"],
  ["properties.update.test.cjs", "PROP-UPDATE", "修改房源"],
  ["properties.delete.test.cjs", "PROP-DELETE", "删除房源"],
  ["applications.list.test.cjs", "APP-LIST", "申请列表"],
  ["applications.detail.test.cjs", "APP-DETAIL", "申请详情"],
  ["applications.create.test.cjs", "APP-CREATE", "提交申请"],
  ["applications.approve.test.cjs", "APP-APPROVE", "一级审批"],
  ["property-api.test.cjs", "FLOW-PROP", "完整房源CRUD流程"],
  ["purchase-application-api.test.cjs", "FLOW-APP", "完整申请与快照流程"],
  ["purchase-approval-api.test.cjs", "FLOW-APPROVE", "完整审批与迁移流程"],
];

/** 防止单元格中的竖线、换行或HTML尖括号破坏固定的五列表格。 */
function escapeCell(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;")
    .replace(/\r?\n/g, " ");
}

/** 表中保留关键字段；完整的值及数组放在相邻JSON证据中，避免每格重复数千字。 */
function compact(value, depth = 0) {
  if (value?.$type === "undefined") return "undefined";
  if (value?.$type === "RegExp") return value.value;
  if (typeof value === "string")
    return JSON.stringify(
      value.length > 160
        ? `${value.slice(0, 120)}…（共${value.length}字符）`
        : value,
    );
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (depth > 1 && value.length)
      return `[共${value.length}项，完整值见JSON证据]`;
    return `[${value
      .slice(0, 5)
      .map((item) => compact(item, depth + 1))
      .join(",")}${value.length > 5 ? `,…共${value.length}项` : ""}]`;
  }
  const entries = Object.entries(value);
  const wanted = [
    "id",
    "name",
    "status",
    "version",
    "code",
    "price",
    "area",
    "dealPrice",
    "deposit",
    "buyerName",
    "propertyId",
    "propertyVersion",
    "decision",
    "comment",
    "requestKey",
    "submissionKey",
    "expectedSigningDate",
    "paymentMethod",
    "message",
    "fields",
    "total",
    "page",
    "pageSize",
    "summary",
    "pending",
    "approved",
    "rejected",
  ];
  const selected =
    entries.length > 9
      ? entries.filter(([key]) => wanted.includes(key))
      : entries;
  return `{${selected
    .slice(0, depth > 1 ? 4 : 9)
    .map(([key, item]) => `${key}:${compact(item, depth + 1)}`)
    .join(
      ",",
    )}${selected.length < entries.length || selected.length > (depth > 1 ? 4 : 9) ? ",…" : ""}}`;
}

/** 给断言标注字段来源；预期仍逐条使用原测试提供的值。 */
function assertionLabel(assertion) {
  const expression = assertion.expression;
  if (/readDatabase\(\)/.test(expression)) return "持久化数据";
  if (expression.length > 160) {
    const tail = expression.match(
      /\.(data(?:\.[\w]+(?:\[\d+\])?)*|status)$/,
    )?.[1];
    if (tail) return tail === "status" ? "HTTP状态码" : tail;
    return `${expression.slice(0, 140)}…`;
  }
  return expression;
}

/** 将实际断言分别渲染为预期/实际列；快照比较展示结论，原始快照保存在JSON。 */
function assertionText(assertion, actual) {
  const label = assertionLabel(assertion);
  if (label === "持久化数据")
    return actual
      ? `${assertion.passed ? "已实际比较，与预期文件快照一致" : "文件快照不一致"}`
      : "持久化内容与指定快照完全相等";
  if (assertion.method === "ok" && !actual)
    return `${label}应为真值（非空或true）`;
  const operator =
    assertion.method === "notEqual"
      ? "≠"
      : assertion.method === "match"
        ? "匹配"
        : "=";
  return `${label}${actual ? "=" : operator}${compact(actual ? assertion.actual : assertion.expected)}`;
}

/** 展示独立测试的前置数据；未变字段可通过报告中的完整fixture直接核对。 */
function initialDescription(record) {
  if (!record.initialData)
    return "前置：种子房源9条、初始申请0条；流程内还包含重启或数据迁移，见源文件。";
  const houses =
    record.initialData.properties
      .map(
        (row) =>
          `房源{id:${row.id},code:${row.code},name:${JSON.stringify(row.name)},city:${row.city},type:${row.type},status:${row.status},area:${row.area}㎡,price:${row.price}万元,version:${row.version}}`,
      )
      .join("；") || "无房源";
  const applications =
    record.initialData.purchaseApplications
      .map(
        (row) =>
          `申请{id:${row.id},status:${row.status},version:${row.version},propertyId:${row.propertyId},propertyVersion:${row.propertyVersion},buyerName:${JSON.stringify(row.buyerName)},dealPrice:${row.dealPrice}万元,history:${row.history.length}条}`,
      )
      .join("；") || "无申请";
  return `前置：${houses}；${applications}。`;
}

/** 为每个真实请求列出查询条件、请求体及特殊Content-Type；按发起顺序保留重试。 */
function requestDescription(request, index) {
  const query = Object.keys(request.query).length
    ? `query=${compact(request.query)}`
    : "无查询参数";
  const body = !request.hasBody
    ? "无请求体"
    : `body=${JSON.stringify(request.body, (_key, value) => {
        if (typeof value !== "string" || value.length <= 180) return value;
        return value.split("").every((character) => character === value[0])
          ? `字符${JSON.stringify(value[0])}重复${value.length}次`
          : `${value.slice(0, 120)}…（共${value.length}字符，完整值见JSON证据）`;
      })}`;
  const type =
    request.headers?.["Content-Type"] || request.headers?.["content-type"];
  return `${index + 1}. ${request.method} ${request.path}；${query}；${body}${type ? `；Content-Type=${type}` : ""}`;
}

/** 只有整个测试进程成功且每个用例都有响应和断言，才覆盖报告，避免把预期冒充实测。 */
function main() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "qijing-api-report-"),
  );
  try {
    const endpointFiles = fs
      .readdirSync(path.join(root, "mock/tests/endpoints"))
      .filter((file) => file.endsWith(".test.cjs"))
      .sort()
      .map((file) => path.join("mock/tests/endpoints", file));
    const flowFiles = fs
      .readdirSync(path.join(root, "mock"))
      .filter((file) => file.endsWith(".test.cjs"))
      .sort()
      .map((file) => path.join("mock", file));
    const result = spawnSync(
      process.execPath,
      [
        "--require",
        path.join(__dirname, "apiTestReportRecorder.cjs"),
        "--test",
        "--test-reporter=spec",
        ...flowFiles,
        ...endpointFiles,
      ],
      {
        cwd: root,
        env: { ...process.env, QIJING_API_REPORT_DIRECTORY: directory },
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `API测试未全部通过（退出码${result.status}），保留旧报告且不生成成功结果。`,
      );
    const records = fs
      .readdirSync(directory)
      .map((file) =>
        JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")),
      );
    if (records.length !== 115)
      throw new Error(
        `预期采集115个用例，实际${records.length}；请核对测试清单后更新报告脚本。`,
      );
    const output = [];
    for (const [filename, prefix, title] of groups) {
      const cases = records
        .filter((record) => path.basename(record.file) === filename)
        .sort((a, b) => a.order - b.order);
      if (!cases.length)
        throw new Error(`没有采集到${filename}，拒绝遗漏接口文档。`);
      for (const [index, record] of cases.entries()) {
        if (
          !record.passed ||
          !record.requests.length ||
          !record.assertions.length ||
          record.requests.some((request) => !request.response) ||
          record.assertions.some((assertion) => !assertion.passed)
        )
          throw new Error(`用例证据不完整：${record.title}`);
        for (const assertion of record.assertions) {
          if (assertion.expression.includes("fields[field]")) {
            const response = record.requests.findLast(
              (request) => request.response?.data?.fields,
            );
            const keys = Object.keys(response?.response?.data?.fields || {});
            if (keys.length === 1)
              assertion.expression = assertion.expression.replace(
                "fields[field]",
                `fields.${keys[0]}`,
              );
          }
        }
        record.caseId = `${prefix}-${String(index + 1).padStart(3, "0")}`;
        record.group = title;
        output.push(record);
      }
    }
    if (output.length !== records.length)
      throw new Error("存在没有归入文档的测试用例。");
    const generatedAt = new Date().toISOString();
    const displayedTime = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(generatedAt));
    const reportDirectory = path.join(root, "docs/reports");
    fs.mkdirSync(reportDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(reportDirectory, "api-test-results.json"),
      JSON.stringify(
        {
          generatedAt,
          timezone: "Asia/Tokyo",
          independentCases: 112,
          flowCases: 3,
          passed: output.length,
          failed: 0,
          cases: output,
        },
        null,
        2,
      ) + "\n",
    );
    let markdown = `# API测试用例与实际执行结果\n\n本表由真实测试自动生成，执行时间：${displayedTime}（Asia/Tokyo）。共115个用例：112个逐接口独立用例、3个原有完整流程用例，全部通过。\n\n- 每一行对应一个测试用例，测试编号可点击定位到源文件行号；同一API的边界场景分别列出。\n- 预期列来自原测试断言的 expected 值；实际列来自本次真实HTTP响应和实际断言值，并非复制预期。\n- 单元格列出关键字段与副作用；过长数组、对象和请求体以摘要显示，完整数据见[本次执行JSON证据](reports/api-test-results.json)，按caseId检索。随机ID、时间戳和追踪号均为本次运行产生。\n- 测试数据均为隔离的模拟值，不是开发数据库或真实客户资料。单位：总价/定金为万元、面积为㎡。\n- 独立测试共用字段的完整默认值见[测试数据构造器](../mock/tests/helpers/fixtures.cjs)；JSON证据包含112个独立用例的完整前置数据，3个流程用例采用种子数据并由源码说明中间准备步骤。\n- 重跑并更新：\`npm run test:api:report\`。此文件由脚本生成，请通过修改测试和生成器维护。\n\n`;
    for (const [filename, _prefix, title] of groups) {
      const cases = output.filter(
        (record) => path.basename(record.file) === filename,
      );
      markdown += `## ${title}\n\n源文件：[${filename}](../${cases[0].file})，本组${cases.length}个用例。\n\n| 测试标号 | 测试的API | 测试数据 | 测试预期返回结果 | 测试实际返回结果 |\n| --- | --- | --- | --- | --- |\n`;
      for (const record of cases) {
        const apis = [
          ...new Set(
            record.requests.map(
              (request) => `${request.method} ${request.path}`,
            ),
          ),
        ]
          .map(escapeCell)
          .join("<br>");
        const data = [
          initialDescription(record),
          ...record.requests.map(requestDescription),
        ]
          .map(escapeCell)
          .join("<br>");
        const expected = record.assertions
          .map((assertion) => escapeCell(assertionText(assertion, false)))
          .join("<br>");
        const actual = [
          "通过；实测HTTP状态序列：" +
            record.requests
              .map((request) => request.response.status)
              .join(" → "),
          ...record.requests.map(
            (request, index) =>
              `第${index + 1}次真实响应：HTTP ${request.response.status}，body=${compact(request.response.data)}`,
          ),
          ...record.assertions.map((assertion) =>
            assertionText(assertion, true),
          ),
        ]
          .map(escapeCell)
          .join("<br>");
        markdown += `| [${record.caseId}](../${record.file}#L${record.line})<br>${escapeCell(record.title)} | ${apis} | ${data} | ${expected} | ${actual} |\n`;
      }
      markdown += "\n";
    }
    fs.writeFileSync(
      path.join(root, "docs/api-test-cases.md"),
      markdown.trimEnd() + "\n",
    );
    console.log(
      `已生成 docs/api-test-cases.md 和 docs/reports/api-test-results.json，${output.length}个用例都有实测证据。`,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
