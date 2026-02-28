module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      [
        "module-resolver",
        {
          root: ["."],
          alias: {
            "@/components": "./src/components",
            "@/screens":    "./src/screens",
            "@/services":   "./src/services",
            "@/context":    "./src/context",
            "@/types":      "./src/types",
            "@/hooks":      "./src/hooks",
            "@/utils":      "./src/utils",
            "@/navigation": "./src/navigation",
            "@/theme":      "./src/theme",
          },
          extensions: [".ios.js", ".android.js", ".js", ".jsx", ".ts", ".tsx", ".json"],
        },
      ],
    ],
  };
};
