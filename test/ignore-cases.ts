export const ignores = ["node_modules", ".git", "**/{node_modules,.git}/**", "**/*.log", "cache/*", "temp?.txt", "**/.hidden", "./literal//", "win\\excluded", "file[*].txt", "broken[", "broken{"]

/** The same cases run through native Plus and the private stock Watchman backend. */
export const cases = [
  ["node_modules/pkg/file", false], [".git/config", false],
  ["deep/node_modules/pkg/file", false], ["deep/.git/config", false],
  ["top.log", false], ["deep/.secret.log", false], ["deep/log.txt", true],
  ["cache/file", false], ["cache/deep/keep", true], ["deep/temp1.txt", true],
  ["temp1.txt", false], ["temp12.txt", true], ["deep/.hidden", false],
  ["literal/deep/file", false], ["literal-sibling/file", true],
  ["win/excluded/deep/file", false], ["win/excluded-sibling/file", true],
  ["file*.txt", false], ["fileX.txt", true], ["broken[", false], ["broken{", false],
  [".visible", true], ["deep/node_modules-sibling/file", true]
] as const
