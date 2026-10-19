import { mkdir, symlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export const files = ["root.ts", "ROOT.TS", ".root.ts", "src/a.ts", "src/b.js", "src/one.md", "src/.dot.ts", "src/deep/c.ts", "src/deep/two.js", "src/no.txt", "a[1].ts", "space name.ts", "line\nname.ts", "é.ts", "😀.ts", "nested/.private/file.ts", "ignored/inside.ts", ".git/objects/deep/object.ts"]
export async function populate(root: string, external: string) {
  await mkdir(root, { recursive: true })
  await mkdir(external, { recursive: true })
  await writeFile(join(root, ".watchmanconfig"), JSON.stringify({ ignore_dirs: ["ignored"], ignore_vcs: [".git"] }))
  for (const name of files) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), name)
  }
  await mkdir(join(root, "empty"))
  await writeFile(join(external, "external.ts"), "external")
  await mkdir(join(external, "deep"))
  await writeFile(join(external, "deep", "external.js"), "external")
  await symlink("root.ts", join(root, "link.ts"))
  await symlink("src", join(root, "alias"))
  await symlink(external, join(root, "external"))
  await symlink("missing", join(root, "broken"))
}

export const patterns = ["*", "**", "**/*", "?.ts", "??.ts", "src/", "src/**", "src/**/*.{ts,js}", "src/[ab].*", "src/@(a|b).*", "src/!(a).ts", "a\\[1\\].ts", "./src/*.ts", "{src,empty}", "{src/deep,ignored}/**", "**/.private/**", "nothing/**"]
