/**
 * tsc-alias replacer: Node ESM needs .js on lodash subpath imports (no package exports map).
 * Must be CommonJS (.cjs) when package.json "type" is "module".
 *
 * @param {{ orig: string }} args
 */
exports.default = function lodashEsmReplacer({ orig }) {
  return orig.replace(
    /(["'])lodash\/([^"']+)\1/g,
    (match, quote, subpath) => {
      if (subpath.endsWith(".js")) {
        return match;
      }
      return `${quote}lodash/${subpath}.js${quote}`;
    },
  );
};
