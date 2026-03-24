import { env } from '../config/env.js';

export interface ProxyConfig {
  url: string;
}

let proxyList: string[] = [];

function loadProxies() {
  if (env.PROXY_URL) {
    // Support comma-separated proxy list
    proxyList = env.PROXY_URL.split(',').map((p) => p.trim()).filter(Boolean);
  }
}

loadProxies();

let index = 0;

/** Get next proxy URL in rotation, or undefined if none configured */
export function getProxy(): ProxyConfig | undefined {
  if (proxyList.length === 0) return undefined;
  const url = proxyList[index % proxyList.length]!;
  index++;
  return { url };
}

/** Check if proxies are available */
export function hasProxies(): boolean {
  return proxyList.length > 0;
}
