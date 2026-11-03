const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

/**
 * 集成场景：真实 HTTP 服务下验证房源完整 CRUD、筛选分页和版本控制。
 * 隔离：随机端口、临时数据文件；不访问或清空正在开发的数据。
 * 预期：非法输入返回 400/422，旧版本修改或删除返回 409；重启保留修改，正确删除后返回 404。
 */
test("property API validates, filters, paginates, persists CRUD and rejects stale versions", async (t) => {
  // 准备：每个测试独占临时目录和数据文件，避免写入开发中的房源与申请。
  const directory = mkdtempSync(path.join(tmpdir(), "property-api-"));
  let child;
  /**
   * 启动真实 API 子进程，使用随机端口和当前测试专属的数据文件。
   * 等待服务输出监听端口后才继续；启动超时或异常退出使测试失败。
   * @returns {Promise<string>} 带 /api/v1 前缀的本次服务地址。
   */
  const start = () =>
    new Promise((resolve, reject) => {
      child = spawn(
        process.execPath,
        [path.join(__dirname, "../../../mock/server.cjs")],
        {
          env: {
            ...process.env,
            MOCK_PORT: "0",
            MOCK_DATA_FILE: path.join(directory, "data.json"),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      // 就绪等待有时间上限，服务未启动不能被误判为接口通过。
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("API startup timeout"));
      }, 10000);
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code) {
          clearTimeout(timer);
          reject(new Error(`API exited ${code}`));
        }
      });
      // 以服务实际监听端口为准，避免使用固定端口导致并发测试冲突。
      child.stdout.on("data", (data) => {
        const port = String(data).match(/listening on (\d+)/)?.[1];
        if (port) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${port}/api/v1`);
        }
      });
    });
  /**
   * 终止当前测试启动的 API 子进程，并等待退出后再重启或清理数据文件。
   * 不影响工作台上运行的开发服务。
   * @returns {Promise<void>} 子进程退出后完成。
   */
  const stop = () =>
    new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
    });
  // 无论用例成功还是失败，都清理本测试启动的进程及临时文件。
  t.after(async () => {
    if (child && child.exitCode === null) await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  let base = await start();
  /**
   * 向隔离服务发送真实 HTTP 请求，同时保留状态码和业务响应供断言。
   * 仅在有 payload 时设置 JSON 请求体，204 不尝试解析 JSON。
   * @param {string} route 相对于 /api/v1 的请求路径。
   * @param {string} method HTTP 方法，默认 GET。
   * @param {object} payload 可选的 JSON 请求体。
   * @returns {Promise<object>} { status, data }，204 的 data 为 null。
   */
  const request = async (route, method = "GET", payload) => {
    const res = await fetch(base + route, {
      method,
      ...(payload !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        : {}),
    });
    return {
      status: res.status,
      data: res.status === 204 ? null : await res.json(),
    };
  };
  // 先核对种子数据的分页结果：返回两条，但总数仍是九条。
  const initial = await request("/properties?pageSize=2");
  assert.equal(initial.status, 200);
  assert.equal(initial.data.items.length, 2);
  assert.equal(initial.data.total, 9);
  // 校验查询参数和空请求体的拒绝行为，防止非法数据进入后续 CRUD。
  assert.equal((await request("/properties?page=0")).status, 400);
  assert.equal((await request("/properties?sort=invalid")).status, 400);
  assert.equal((await request("/properties", "POST", {})).status, 422);
  // 合法房源作为后续新增、筛选、编辑和删除的共享场景输入，金额单位为万元。
  const payload = {
    name: "集成测试房源",
    city: "上海",
    district: "浦东新区",
    address: "测试路1号",
    type: "住宅",
    status: "在售",
    area: 100.5,
    price: 500,
    rooms: 3,
    contact: "测试经理",
    phone: "13800138000",
    description: "",
  };
  // 新增后必须返回 201 和初始版本，后续操作使用后端生成的 ID。
  const created = await request("/properties", "POST", payload);
  assert.equal(created.status, 201);
  assert.equal(created.data.version, 1);
  const id = created.data.id;
  // 组合搜索应仅命中新房源；全库统计仍包含其他房源，不受筛选影响。
  const filtered = await request(
    "/properties?keyword=" +
      encodeURIComponent("集成测试") +
      "&status=" +
      encodeURIComponent("在售"),
  );
  assert.equal(filtered.data.total, 1);
  assert.equal(filtered.data.items[0].id, id);
  assert.equal(filtered.data.summary.total, 10);
  assert.equal((await request("/properties/" + id)).data.name, payload.name);
  assert.equal(
    (
      await request("/properties/" + id, "PUT", {
        ...payload,
        area: -1,
        version: 1,
      })
    ).status,
    422,
  );
  // 合法修改应更新字段并递增版本，不能只验证 HTTP 状态码。
  const updated = await request("/properties/" + id, "PUT", {
    ...payload,
    price: 600,
    name: "已编辑房源",
    version: 1,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.price, 600);
  assert.equal(updated.data.version, 2);
  assert.equal(
    (await request("/properties/" + id, "PUT", { ...payload, version: 1 }))
      .status,
    409,
  );
  assert.equal(
    (await request("/properties/" + id, "DELETE", { version: 1 })).status,
    409,
  );
  // 停止并重新启动真实服务，验证修改来自文件持久化而不是旧进程内存。
  await stop();
  base = await start();
  assert.equal((await request("/properties/" + id)).data.name, "已编辑房源");
  assert.equal(
    (await request("/properties/" + id, "DELETE", { version: 2 })).status,
    204,
  );
  // 删除后详情必须为 404，列表总数恢复到种子数据数量。
  assert.equal((await request("/properties/" + id)).status, 404);
  assert.equal((await request("/properties")).data.total, 9);
});
