const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");

// HTML 内の一部関数だけでなく、起動・ログインを含むスクリプト全体を検査する。
const adminDir = path.join(__dirname, "..", "admin");
for (const file of fs.readdirSync(adminDir).filter((file) => file.endsWith(".html"))) {
  test(`admin/${file}: every inline script can be parsed`, () => {
    const html = fs.readFileSync(path.join(adminDir, file), "utf8");
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    if (file === "catalog.html") assert.ok(scripts.length, "catalog scripts are present");
    for (const [index, match] of scripts.entries()) {
      if (/\bsrc\s*=/i.test(match[1])) continue;
      const lineOffset = html.slice(0, match.index + match[0].indexOf(">") + 1).split("\n").length - 1;
      assert.doesNotThrow(() => new Script(match[2], {
        filename: `admin/${file}:script${index + 1}`, lineOffset,
      }));
    }
  });
}
