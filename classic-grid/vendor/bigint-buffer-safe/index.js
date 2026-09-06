"use strict";

function widthOf(value) {
  const width = Number(value);
  if (!Number.isSafeInteger(width) || width < 0) {
    throw new RangeError("width must be a non-negative safe integer");
  }
  return width;
}

function toBigIntLE(buf) {
  const reversed = Buffer.from(buf);
  reversed.reverse();
  const hex = reversed.toString("hex");
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function toBigIntBE(buf) {
  const hex = Buffer.from(buf).toString("hex");
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function toBufferBE(num, requestedWidth) {
  const width = widthOf(requestedWidth);
  if (typeof num !== "bigint" || num < 0n) {
    throw new RangeError("num must be a non-negative bigint");
  }
  const hex = num.toString(16).padStart(width * 2, "0").slice(0, width * 2);
  return Buffer.from(hex, "hex");
}

function toBufferLE(num, width) {
  const buffer = toBufferBE(num, width);
  buffer.reverse();
  return buffer;
}

module.exports = { toBigIntLE, toBigIntBE, toBufferLE, toBufferBE };
