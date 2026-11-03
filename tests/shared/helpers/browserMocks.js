/**
 * 补齐JSDOM缺少的dialog方法；仅模拟open属性，不伪装真实浏览器的焦点和遮罩验证。
 * includeCrypto用于申请和审批用例的UUID支持，不包含任何业务数据或API响应。
 */
export function installBrowserMocks({ includeCrypto = false } = {}) {
  if (includeCrypto)
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: require("crypto").randomUUID },
    });
  /** 测试替身：打开dialog属性，让真实组件挂载逻辑可执行。 */
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  /** 测试替身：清除dialog属性，让卸载清理逻辑可执行。 */
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}
