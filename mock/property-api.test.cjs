const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

test("property API validates, filters, paginates, persists CRUD and rejects stale versions", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "property-api-"));
  let child;
  const start = () =>
    new Promise((resolve, reject) => {
      child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
        env: {
          ...process.env,
          MOCK_PORT: "0",
          MOCK_DATA_FILE: path.join(directory, "data.json"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
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
      child.stdout.on("data", (data) => {
        const port = String(data).match(/listening on (\d+)/)?.[1];
        if (port) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${port}/api/v1`);
        }
      });
    });
  const stop = () =>
    new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
    });
  t.after(async () => {
    if (child && child.exitCode === null) await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  let base = await start();
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
  const initial = await request("/properties?pageSize=2");
  assert.equal(initial.status, 200);
  assert.equal(initial.data.items.length, 2);
  assert.equal(initial.data.total, 9);
  assert.equal((await request("/properties?page=0")).status, 400);
  assert.equal((await request("/properties?sort=invalid")).status, 400);
  assert.equal((await request("/properties", "POST", {})).status, 422);
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
  const created = await request("/properties", "POST", payload);
  assert.equal(created.status, 201);
  assert.equal(created.data.version, 1);
  const id = created.data.id;
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
  await stop();
  base = await start();
  assert.equal((await request("/properties/" + id)).data.name, "已编辑房源");
  assert.equal(
    (await request("/properties/" + id, "DELETE", { version: 2 })).status,
    204,
  );
  assert.equal((await request("/properties/" + id)).status, 404);
  assert.equal((await request("/properties")).data.total, 9);
});
