export const formatNumber = (value) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
