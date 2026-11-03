/**
 * 以中文区域规则格式化数字，保留最多两位小数。
 * 仅用于展示，不承担金额计算或字段校验。
 * @param {number} value 需要展示的数值。
 * @returns {string} 带千位分隔符的文本。
 */
export const formatNumber = (value) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
