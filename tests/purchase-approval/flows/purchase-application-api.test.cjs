const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

/**
 * 集成场景：校验申请必填信息、房源资格、幂等提交和历史快照。
 * 操作：无效提交、串行/并发重试、更新房源、重启服务。
 * 预期：非法字段 422，房源冲突 409；相同请求不重复建单，快照与持久化结果不随房源变化丢失。
 */
test("purchase API validates house selection, idempotency, snapshots and persistence", async (t) => {
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
  // 从真实接口选一套在售房源，使用它的实际 ID 和版本提交申请。
  const houses = await request(
    "/properties?status=" + encodeURIComponent("在售"),
  );
  const property = houses.data.items[0];
  // 统一合法基线，每个失败场景仅修改一个字段，以明确失败原因。
  const payload = {
    submissionKey: "purchase-test-request-1",
    propertyId: property.id,
    propertyVersion: property.version,
    buyerName: "模拟买方",
    buyerPhone: "13800138000",
    dealPrice: 500,
    deposit: 20,
    paymentMethod: "商业贷款",
    expectedSigningDate: "2027-01-15",
    remarks: "接口验收",
  };
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        propertyId: "",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        propertyId: "missing",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        dealPrice: 0,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        deposit: 501,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        expectedSigningDate: "2027-02-30",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        propertyVersion: 999,
      })
    ).status,
    409,
  );
  // 已售房源即使版本正确也不能申请，验证状态规则独立于字段校验。
  const sold = (
    await request("/properties?status=" + encodeURIComponent("已售"))
  ).data.items[0];
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        propertyId: sold.id,
        propertyVersion: sold.version,
      })
    ).status,
    409,
  );
  // 首次有效提交应创建待审核申请和房源快照，内部去重键不对外返回。
  const created = await request("/purchase-applications", "POST", payload);
  assert.equal(created.status, 201);
  assert.equal(created.data.status, "待审核");
  assert.equal(created.data.propertySnapshot.name, property.name);
  assert.equal(created.data.submissionKey, undefined);
  // 串行重试应返回原申请而不是新建，状态为 200 且 ID 保持一致。
  const duplicate = await request("/purchase-applications", "POST", payload);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.id, created.data.id);
  // 并发发送相同提交键，断言两次响应对应同一申请，覆盖连点与重试竞争。
  const parallel = await Promise.all([
    request("/purchase-applications", "POST", {
      ...payload,
      submissionKey: "parallel-key",
    }),
    request("/purchase-applications", "POST", {
      ...payload,
      submissionKey: "parallel-key",
    }),
  ]);
  assert.equal(parallel[0].data.id, parallel[1].data.id);
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        dealPrice: 600,
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("/properties/" + property.id)).data.status,
    "在售",
  );
  // 申请后修改当前房源，再读历史申请；快照必须仍是提交时的名称。
  const modified = await request("/properties/" + property.id, "PUT", {
    ...property,
    name: "后续更新的房源名称",
  });
  assert.equal(modified.status, 200);
  assert.equal(
    (await request("/purchase-applications/" + created.data.id)).data
      .propertySnapshot.name,
    property.name,
  );
  assert.equal(
    (
      await request(
        "/purchase-applications?keyword=" +
          encodeURIComponent("模拟买方") +
          "&pageSize=1",
      )
    ).data.items.length,
    1,
  );
  assert.equal((await request("/purchase-applications?page=0")).status, 400);
  assert.equal(
    (await request("/purchase-applications/" + created.data.id, "DELETE", {}))
      .status,
    405,
  );
  // 重启后同时检查申请和房源，防止保存一种业务时覆盖另一种业务的数据。
  await stop();
  base = await start();
  assert.equal(
    (await request("/purchase-applications/" + created.data.id)).data.dealPrice,
    500,
  );
  assert.equal((await request("/purchase-applications")).data.total, 2);
  assert.equal(
    (await request("/properties/" + property.id)).data.name,
    "后续更新的房源名称",
  );
});
