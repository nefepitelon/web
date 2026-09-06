import "client-only";

import { normalizeClassicGridEnvironment } from "@/components/classic-grid-environment-schema";

const DATABASE_NAME = "welinkbtc-classic-grid-local-vault";
const STORE_NAME = "vault";
const STORAGE_VERSION = 1;

type VaultRecord = {
  version: number;
  updatedAt: string;
  iv: number[];
  ciphertext: ArrayBuffer;
};

function openVault() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开浏览器本地保险库"));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("浏览器本地保险库操作失败"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("浏览器本地保险库写入失败"));
    transaction.onabort = () => reject(transaction.error || new Error("浏览器本地保险库写入已中止"));
  });
}

async function getOrCreateKey(database: IDBDatabase, scope: string) {
  const existing = await requestResult(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(`key:${scope}`)) as CryptoKey | undefined;
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(key, `key:${scope}`);
  await transactionDone(transaction);
  return key;
}

export async function saveClassicGridEnvironmentLocally(scope: string, values: Record<string, string>) {
  const database = await openVault();
  try {
    const key = await getOrCreateKey(database, scope);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(normalizeClassicGridEnvironment(values)));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
    const updatedAt = new Date().toISOString();
    const record: VaultRecord = { version: STORAGE_VERSION, updatedAt, iv: Array.from(iv), ciphertext };
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record, `environment:${scope}`);
    await transactionDone(transaction);
    localStorage.setItem(`welinkbtc:classic-grid:environment:${scope}`, JSON.stringify({ version: STORAGE_VERSION, updatedAt }));
    return updatedAt;
  } finally {
    database.close();
  }
}

export async function loadClassicGridEnvironmentLocally(scope: string) {
  const database = await openVault();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const [key, record] = await Promise.all([
      requestResult(store.get(`key:${scope}`)) as Promise<CryptoKey | undefined>,
      requestResult(store.get(`environment:${scope}`)) as Promise<VaultRecord | undefined>
    ]);
    if (!key || !record || record.version !== STORAGE_VERSION) return null;
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv) }, key, record.ciphertext);
    return {
      values: normalizeClassicGridEnvironment(JSON.parse(new TextDecoder().decode(plaintext)) as unknown),
      updatedAt: record.updatedAt
    };
  } finally {
    database.close();
  }
}

export async function clearClassicGridEnvironmentLocally(scope: string) {
  const database = await openVault();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(`environment:${scope}`);
    transaction.objectStore(STORE_NAME).delete(`key:${scope}`);
    await transactionDone(transaction);
    localStorage.removeItem(`welinkbtc:classic-grid:environment:${scope}`);
  } finally {
    database.close();
  }
}
