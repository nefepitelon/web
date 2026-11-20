import { lookup, type LookupOptions } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4]
] as const) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["2001:db8::", 32], ["2001::", 32], ["2001:2::", 48], ["2002::", 16]] as const) blocked.addSubnet(address, prefix, "ipv6");
const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");

export function isPublicProxyAddress(value: string) {
  const address = value.replace(/^\[|\]$/g, "");
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4")
    : family === 6 && globalIpv6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

export function assertPublicProxyHostname(value: string) {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (!hostname || hostname === "localhost" || /\.(?:localhost|local|internal|home\.arpa)$/.test(hostname)
    || !isIP(hostname) && !hostname.includes(".") || isIP(hostname) && !isPublicProxyAddress(hostname)) {
    throw new Error("代理不能指向本机、私有或保留网络地址");
  }
}

// Validate every DNS answer in the actual connector lookup. The connector uses
// these same addresses, avoiding a separate check/resolve DNS rebinding window.
export function createPublicProxyLookup(resolve: typeof lookup = lookup): LookupFunction {
  return (hostname: string, options: LookupOptions, callback) => {
    try { assertPublicProxyHostname(hostname); }
    catch { callback(Object.assign(new Error("代理目标不是公网地址"), { code: "EACCES" }), ""); return; }
    resolve(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) { callback(error, ""); return; }
      if (!addresses.length || addresses.some(item => !isPublicProxyAddress(item.address))) {
        callback(Object.assign(new Error("代理 DNS 目标不是公网地址"), { code: "EACCES" }), ""); return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

export const publicProxyLookup = createPublicProxyLookup();

export function normalizePublicTradingProxy(value: string | null | undefined) {
  const proxy = String(value ?? "").trim();
  if (!proxy) return "";
  if (proxy.toLowerCase() === "direct") return "direct";
  let url: URL;
  try {
    url = new URL(proxy.includes("://") ? proxy : `http://${proxy}`);
  } catch {
    throw new Error("代理地址格式无效");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("云端执行器仅支持 HTTP/HTTPS CONNECT 代理");
  assertPublicProxyHostname(url.hostname);
  if (!url.port) throw new Error("代理地址必须包含端口");
  return url.toString().replace(/\/$/, "");
}
