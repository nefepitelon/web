const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

test("brand icon assets cover browser tabs and Apple touch icons", () => {
  assert.deepEqual(readPngDimensions(path.join(root, "app", "icon.png")), {
    width: 512,
    height: 512
  });
  assert.deepEqual(readPngDimensions(path.join(root, "app", "apple-icon.png")), {
    width: 180,
    height: 180
  });

  const favicon = fs.readFileSync(path.join(root, "app", "favicon.ico"));
  assert.equal(favicon.readUInt16LE(0), 0);
  assert.equal(favicon.readUInt16LE(2), 1);
  const imageCount = favicon.readUInt16LE(4);
  assert.ok(imageCount >= 6);

  const sizes = Array.from({ length: imageCount }, (_, index) => {
    const offset = 6 + index * 16;
    const width = favicon[offset] || 256;
    const height = favicon[offset + 1] || 256;
    const imageOffset = favicon.readUInt32LE(offset + 12);
    assert.deepEqual(
      [...favicon.subarray(imageOffset, imageOffset + 8)],
      [137, 80, 78, 71, 13, 10, 26, 10]
    );
    assert.equal(favicon[imageOffset + 25], 6, `${width}x${height} favicon frame must be RGBA`);
    return `${width}x${height}`;
  });
  for (const size of ["16x16", "32x32", "48x48", "64x64", "128x128", "256x256"]) {
    assert.ok(sizes.includes(size), `favicon.ico is missing ${size}`);
  }
});
