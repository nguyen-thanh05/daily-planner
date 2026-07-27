import { Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "settings.json";
const SYNC_FOLDER_KEY = "syncFolder";
const LAST_SYNC_KEY = "lastSyncAt";

let storePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE);
  }
  return storePromise;
}

export async function getSyncFolder(): Promise<string | null> {
  const store = await getStore();
  const value = await store.get<string>(SYNC_FOLDER_KEY);
  return value ?? null;
}

export async function setSyncFolder(path: string): Promise<void> {
  const store = await getStore();
  await store.set(SYNC_FOLDER_KEY, path);
  await store.save();
}

export async function getLastSyncAt(): Promise<string | null> {
  const store = await getStore();
  const value = await store.get<string>(LAST_SYNC_KEY);
  return value ?? null;
}

export async function setLastSyncAt(iso: string): Promise<void> {
  const store = await getStore();
  await store.set(LAST_SYNC_KEY, iso);
  await store.save();
}
