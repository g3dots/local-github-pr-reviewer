import type { Provider } from "./types.js";
import { claudeProvider } from "./claude.js";
import { geminiProvider } from "./gemini.js";

const REGISTRY: Record<string, Provider> = {
  [claudeProvider.id]: claudeProvider,
  [geminiProvider.id]: geminiProvider,
};

export function getProvider(id: string): Provider {
  const p = REGISTRY[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function listProviders(): Provider[] {
  return Object.values(REGISTRY);
}

export async function listProviderStatus(): Promise<
  { id: string; displayName: string; available: boolean }[]
> {
  return Promise.all(
    listProviders().map(async (p) => ({
      id: p.id,
      displayName: p.displayName,
      available: await p.isAvailable(),
    })),
  );
}

export type { Provider } from "./types.js";
