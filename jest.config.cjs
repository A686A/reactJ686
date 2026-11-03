/**
 * 前端测试单独放在根目录tests，不依赖CRA仅扫描src的约定。
 * 只发现.test.js组件测试；.test.cjs真实HTTP测试继续由Node原生运行器执行。
 */
module.exports = {
  roots: ["<rootDir>/tests"],
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  transform: {
    "^.+\\.[jt]sx?$": [
      "babel-jest",
      {
        presets: [["babel-preset-react-app", { runtime: "automatic" }]],
        babelrc: false,
        configFile: false,
      },
    ],
  },
};
