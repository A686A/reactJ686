/** Development-only API. Never expose this unauthenticated server in production. */
const http = require("node:http");
const handlePurchaseApplications = require("./purchase-application-api.cjs");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const dataFile =
  process.env.MOCK_DATA_FILE || path.join(__dirname, ".data/properties.json");
const seedFile = path.join(__dirname, "seed.json");
fs.mkdirSync(path.dirname(dataFile), { recursive: true });
if (!fs.existsSync(dataFile)) fs.copyFileSync(seedFile, dataFile);
const database = JSON.parse(fs.readFileSync(dataFile, "utf8"));
let records = database.properties;
let applications = database.purchaseApplications || [];
if (!Array.isArray(applications)) throw new Error("Invalid purchase database");
// Legacy submissions enter the review queue without losing their original data.
applications = applications.map((row) => ({
  ...row,
  status: row.status === "已提交" ? "待审核" : row.status,
  version: row.version || 1,
  history: row.history || [
    {
      id: `submitted-${row.id}`,
      action: "提交申请",
      actor: "演示申请人",
      comment: "",
      createdAt: row.submittedAt,
    },
  ],
}));
if (!Array.isArray(records)) throw new Error("Invalid property database");
const types = ["住宅", "公寓", "商铺", "写字楼"];
const statuses = ["待上架", "在售", "已售", "已下架"];
/**
 * 创建带 HTTP 状态码和字段错误的异常，供统一错误响应处理。
 * @param {number} status HTTP 状态码。
 * @param {string} message 可展示给调用方的错误。
 * @param {object} fields 可选的字段级错误。
 * @returns {Error} 携带响应元数据的异常。
 */
const fail = (status, message, fields = {}) =>
  Object.assign(new Error(message), { status, fields });
/**
 * 对模拟后端收到的房源字段独立校验，并仅返回允许写入的业务字段。
 * 校验失败抛出 422，不接受客户端指定系统 ID、时间或版本。
 * @param {object} input JSON 请求体。
 * @returns {object} 经校验的房源数据。
 */
function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw fail(422, "请求体须为对象");
  const fields = {},
    data = {};
  const limits = {
    name: 80,
    city: 30,
    district: 30,
    address: 200,
    contact: 40,
    phone: 25,
  };
  for (const [key, max] of Object.entries(limits)) {
    data[key] = typeof input[key] === "string" ? input[key].trim() : "";
    if (!data[key] || data[key].length > max)
      fields[key] = `必填，最多 ${max} 字`;
  }
  if (!/^\+?[\d\s()-]{6,25}$/.test(data.phone))
    fields.phone = "联系电话格式不正确";
  for (const [key, max] of Object.entries({
    area: 1000000,
    price: 10000000,
    rooms: 100,
  })) {
    data[key] = input[key];
    if (
      typeof data[key] !== "number" ||
      !Number.isFinite(data[key]) ||
      data[key] < (key === "rooms" ? 0 : 0.01) ||
      data[key] > max ||
      (key === "rooms" && !Number.isInteger(data[key]))
    )
      fields[key] = "数值超出允许范围";
  }
  data.type = input.type;
  data.status = input.status;
  if (!types.includes(data.type)) fields.type = "无效房源类型";
  if (!statuses.includes(data.status)) fields.status = "无效房源状态";
  data.description = input.description === undefined ? "" : input.description;
  if (typeof data.description !== "string" || data.description.length > 1000)
    fields.description = "备注须为不超过 1,000 字的文本";
  if (Object.keys(fields).length) throw fail(422, "请检查房源信息", fields);
  return data;
}
/**
 * 将房源和申请一起写入临时文件后替换数据文件，再更新内存引用。
 * 写入失败不替换内存状态；仅适用于当前单进程开发服务。
 * @param {Array} next 完整房源集合。
 * @param {Array} nextApplications 完整申请集合，默认保留现有记录。
 */
function persist(next, nextApplications = applications) {
  const temporary = `${dataFile}.tmp`;
  fs.writeFileSync(
    temporary,
    JSON.stringify(
      { ...database, properties: next, purchaseApplications: nextApplications },
      null,
      2,
    ),
  );
  fs.renameSync(temporary, dataFile);
  records = next;
  applications = nextApplications;
}
/**
 * 读取 JSON 请求体并限制为 64 KiB，保持内容类型和格式错误可区分。
 * @param {import('node:http').IncomingMessage} req HTTP 请求流。
 * @returns {Promise<unknown>} 解析后的 JSON；不在此处执行业务字段校验。
 */
async function body(req) {
  if (!req.headers["content-type"]?.includes("application/json"))
    throw fail(415, "请使用 application/json");
  let raw = "",
    size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw fail(413, "请求体过大");
    raw += chunk;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw fail(400, "JSON 格式错误");
  }
}
/**
 * 解析分页正整数，未提供参数时使用默认值。
 * @param {string|null} value URL 查询参数。
 * @param {number} fallback 缺省值。
 * @param {number} max 允许的最大值。
 * @returns {number} 校验通过的整数；无效输入抛出 400。
 */
function positive(value, fallback, max) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max)
    throw fail(400, "分页参数无效");
  return Number(value);
}
// 统一入口：为每个请求生成追踪 ID，先委派购房申请路由，再处理房源 CRUD。
const server = http.createServer(async (req, res) => {
  const requestId = randomUUID();
  /**
   * 输出统一 JSON 响应及请求追踪 ID；无响应数据时保持空响应体。
   * @param {number} status HTTP 状态码。
   * @param {unknown} value 可选的响应数据，例如删除成功不传该参数。
   */
  const send = (status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(value === undefined ? undefined : JSON.stringify(value));
  };
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/v1/health" && req.method === "GET")
      return send(200, { status: "ok" });
    if (
      // 注入读取函数而不是旧集合快照，让等待请求体后的审批读取最新状态。
      await handlePurchaseApplications({
        req,
        url,
        send,
        body,
        fail,
        positive,
        /** 读取处理时的最新房源集合，避免在异步读取请求体前固定旧引用。 */
        getProperties: () => records,
        /** 读取处理时的最新申请集合，供幂等和状态校验使用。 */
        getApplications: () => applications,
        /** 保存完整申请集合，同时保留调用时的当前房源数据。 */
        saveApplications: (next) => persist(records, next),
      })
    )
      return;
    const match = url.pathname.match(/^\/api\/v1\/properties(?:\/([^/]+))?$/);
    if (!match) throw fail(404, "接口不存在");
    const id = match[1],
      method = req.method;
    if (!id && method === "GET") {
      const p = url.searchParams;
      const page = positive(p.get("page"), 1, 1000000),
        pageSize = positive(p.get("pageSize"), 8, 100);
      const keyword = (p.get("keyword") || "").trim().toLowerCase();
      const status = p.get("status"),
        type = p.get("type");
      if (status && !statuses.includes(status)) throw fail(400, "无效状态筛选");
      if (type && !types.includes(type)) throw fail(400, "无效类型筛选");
      const sort = p.get("sort") || "updatedAt",
        order = p.get("order") || "desc";
      if (
        !["updatedAt", "price", "area", "name"].includes(sort) ||
        !["asc", "desc"].includes(order)
      )
        throw fail(400, "排序参数无效");
      // 筛选作用于结果列表；响应中的 summary 仍按全库数据计算。
      const filtered = records.filter(
        (row) =>
          (!status || row.status === status) &&
          (!type || row.type === type) &&
          (!keyword ||
            [row.code, row.name, row.city, row.district, row.address]
              .join(" ")
              .toLowerCase()
              .includes(keyword)),
      );
      // 数值字段按大小比较，文本按中文排序；相等时用 ID 保证顺序稳定。
      filtered.sort((a, b) => {
        const cmp =
          typeof a[sort] === "number"
            ? a[sort] - b[sort]
            : String(a[sort]).localeCompare(String(b[sort]), "zh-CN");
        return (order === "asc" ? cmp : -cmp) || a.id.localeCompare(b.id);
      });
      return send(200, {
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        total: filtered.length,
        page,
        pageSize,
        summary: {
          total: records.length,
          forSale: records.filter((r) => r.status === "在售").length,
          sold: records.filter((r) => r.status === "已售").length,
          totalPrice: records.reduce((sum, r) => sum + r.price, 0),
        },
      });
    }
    if (!id && method === "POST") {
      const data = validate(await body(req)),
        now = new Date().toISOString(),
        uuid = randomUUID();
      const row = {
        ...data,
        id: uuid,
        code: `RE-${uuid.slice(0, 8).toUpperCase()}`,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      persist([row, ...records]);
      return send(201, row);
    }
    if (!id || !["GET", "PUT", "DELETE"].includes(method))
      throw fail(405, "不支持的请求方法");
    const index = records.findIndex((row) => row.id === id);
    if (index < 0) throw fail(404, "房源已删除或不存在，请刷新列表");
    if (method === "GET") return send(200, records[index]);
    const input = await body(req);
    // 写入前比较调用方读取版本，避免覆盖其他操作已更新的房源。
    if (input?.version !== records[index].version)
      throw fail(409, "房源已被其他操作更新，请关闭窗口并刷新后重试");
    if (method === "DELETE") {
      persist(records.filter((row) => row.id !== id));
      return send(204);
    }
    const row = {
      ...records[index],
      ...validate(input),
      version: records[index].version + 1,
      updatedAt: new Date().toISOString(),
    };
    const next = [...records];
    next[index] = row;
    persist(next);
    send(200, row);
    // 未知异常只在服务端记录细节，对外返回统一错误，不泄漏堆栈。
  } catch (error) {
    if (!error.status) console.error(`[${requestId}]`, error);
    send(error.status || 500, {
      message: error.status ? error.message : "服务异常，请稍后重试",
      fields: error.fields || {},
      requestId,
    });
  }
});
server.listen(
  Number(process.env.MOCK_PORT || 3004),
  process.env.MOCK_HOST || "127.0.0.1",
  () => console.log(`Property mock API listening on ${server.address().port}`),
);
