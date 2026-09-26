import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const icon = await readFile(new URL("app/icon.svg", root));
await mkdir(new URL("public/icons/", root), { recursive: true });

for (const size of [192, 512]) {
  await sharp(icon).resize(size, size).png().toFile(new URL(`public/icons/icon-${size}.png`, root).pathname);
}

// ホーム画面のアイコンは背景を不透明にする。maskableの図柄は中央の安全領域に収まる。
await sharp(icon).resize(180, 180).flatten({ background: "#065FD4" }).png().toFile(new URL("app/apple-icon.png", root).pathname);
await sharp(icon).resize(512, 512).flatten({ background: "#065FD4" }).png().toFile(new URL("public/icons/icon-maskable-512.png", root).pathname);

// ICOディレクトリに16/32/48pxのPNGを格納し、小さいタブでも専用サイズを使う。
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(icon).resize(size, size).png().toBuffer()));
const directory = Buffer.alloc(6 + images.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
for (const [index, data] of images.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(data.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += data.length;
}
await writeFile(new URL("app/favicon.ico", root), Buffer.concat([directory, ...images]));
await sharp(await readFile(new URL("assets/social-card.svg", root))).png().toFile(new URL("public/social-card.png", root).pathname);
console.log("ファビコン・ホーム画面アイコン・共有画像を再生成しました。");
