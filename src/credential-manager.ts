import { decryptDeviceSecret, encryptDeviceSecret } from "./crypto";
import { credentialDestination } from "./credential-destination";
import type { SessionCredential } from "./credential-destination";
import type { ProviderConfig, ProviderId, Settings, DeviceCipher } from "./types";
import type { createWorkspaceSession } from "./workspace-session";

export type Credentials = Partial<Record<ProviderId, SessionCredential>>;
type Session = ReturnType<typeof createWorkspaceSession>;
type SaveSettings = (change: (current: Settings) => Partial<Settings>) => Promise<boolean>;

/** Restore only the current device vault to its original destination. */
export function restoreDeviceCredentials(
  settings: Settings,
  session: Session,
  signal: AbortSignal,
  onRestored: (provider: ProviderId, credential: SessionCredential) => void,
  onError: () => void,
  decrypt: (vault: DeviceCipher) => Promise<string> = decryptDeviceSecret,
): () => void {
  let cancelled = false;
  for (const [provider, vault] of Object.entries(settings.vaults)) {
    if (!vault || vault.version !== 2) continue;
    const target = settings.providers[provider as ProviderId];
    const destination = credentialDestination(target);
    if (!destination || (target.id === "lmstudio" && vault.destination !== destination)) continue;
    void decrypt(vault).then((value) => {
      const current = session.get().settings;
      if (cancelled || signal.aborted || current.vaults[target.id]?.data !== vault.data || credentialDestination(current.providers[target.id]) !== destination) return;
      onRestored(target.id, { destination, value });
    }).catch(() => { if (!cancelled && !signal.aborted) onError(); });
  }
  return () => { cancelled = true; };
}

type CredentialActionDependencies = {
  config: Readonly<ProviderConfig>;
  input: string;
  saveOnDevice: boolean;
  signal: AbortSignal;
  saveSettings: SaveSettings;
  remember: (provider: ProviderId, credential?: SessionCredential) => void;
  clearInput: () => void;
  notify: (message: string) => void;
  encrypt?: (value: string) => Promise<DeviceCipher>;
};

export function createCredentialActions({ config, input, saveOnDevice, signal, saveSettings, remember, clearInput, notify, encrypt = encryptDeviceSecret }: CredentialActionDependencies) {
  const storeKey = async () => {
    if (signal.aborted) return;
    if (!input) { notify("Enter a key or token first."); return; }
    try {
      const destination = credentialDestination(config);
      if (!destination) throw new Error("Enter a valid server address before using a credential.");
      if (saveOnDevice) {
        const cipher = await encrypt(input);
        if (signal.aborted) return;
        if (config.id === "lmstudio") cipher.destination = destination;
        const saved = await saveSettings((current) => ({ vaults: { ...current.vaults, [config.id]: cipher } }));
        if (!saved || signal.aborted) return;
      }
      remember(config.id, { destination, value: input });
      clearInput();
      notify(saveOnDevice ? "Key saved on this device." : "Key available for this session only.");
    } catch (error) {
      if (!signal.aborted) notify(error instanceof Error ? error.message : "Something went wrong.");
    }
  };
  const deleteKey = async () => {
    const saved = await saveSettings((current) => {
      const vaults = { ...current.vaults };
      delete vaults[config.id];
      return { vaults };
    });
    if (!saved || signal.aborted) return;
    remember(config.id, undefined);
    clearInput();
    notify("Saved key removed and session locked.");
  };
  return { storeKey, deleteKey };
}
