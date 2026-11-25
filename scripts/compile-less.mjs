import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import less from "less";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stylesDir = path.join(root, "styles");
const sheets = ["popup", "cal1", "cal2", "cal3", "calWheel", "calGreg"];

export async function compileLess(outDir) {
  await fs.promises.mkdir(outDir, { recursive: true });
  for (const name of sheets) {
    const filename = path.join(stylesDir, `${name}.less`);
    const source = await fs.promises.readFile(filename, "utf8");
    const result = await less.render(source, {
      filename,
      paths: [stylesDir],
      rewriteUrls: "off",
    });
    // The previous Visual Studio compiler dropped the leading ./ on urls.
    const css = result.css.replace(/url\((['"]?)\.\//g, "url($1");
    await fs.promises.writeFile(path.join(outDir, `${name}.css`), css);
  }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const outDir = path.resolve(root, process.argv[2] || path.join(".output", "css"));
  await compileLess(outDir);
  console.log(`Compiled ${sheets.length} stylesheets to ${outDir}`);
}
