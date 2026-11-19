/* The payment methods the home page may name: the existing pack read (fetchPack), never a guess. */
import { fetchPack } from "./django.ts";
import { storefrontEnv } from "./env.ts";

/** The site's live checkout methods, or null when the read failed, the pack is off, or the API did not say
    (no direct-only default here: the home then names no method). */
export async function homePayMethods(host: string): Promise<{ direct: boolean; xendit: boolean } | null> {
  const pack = await fetchPack(host, storefrontEnv()).catch(() => null);
  return pack?.methods ?? null;
}
