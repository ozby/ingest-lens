import type { SecretManagerAdapter, SecretManagerRegistry } from "./types";

import { dopplerAdapter } from "./doppler";
import { infisicalAdapter } from "./infisical";

export function createSecretManagerRegistry(): SecretManagerRegistry {
  const adapters = new Map<string, SecretManagerAdapter>();
  return {
    register(adapter: SecretManagerAdapter): void {
      if (adapters.has(adapter.name)) {
        throw new Error(`Secret manager adapter already registered: "${adapter.name}"`);
      }
      adapters.set(adapter.name, adapter);
    },
    get(name: string): SecretManagerAdapter | undefined {
      return adapters.get(name);
    },
    has(name: string): boolean {
      return adapters.has(name);
    },
    names(): string[] {
      return Array.from(adapters.keys());
    },
  };
}

export const secretManagerRegistry = createSecretManagerRegistry();
secretManagerRegistry.register(dopplerAdapter);
secretManagerRegistry.register(infisicalAdapter);
