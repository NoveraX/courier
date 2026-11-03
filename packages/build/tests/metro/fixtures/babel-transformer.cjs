/* The least a Metro build needs of Babel: ES modules turned into CommonJS. */
const { transformSync } = require("@babel/core");

module.exports.transform = ({ filename, src }) => {
  const result = transformSync(src, {
    filename,
    ast: true,
    code: false,
    babelrc: false,
    configFile: false,
    sourceType: "unambiguous",
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  return { ast: result.ast, metadata: result.metadata };
};
