import { useEffect, useRef, useState } from "react";
import { credentialDestination, credentialFor, type SessionCredential } from "./credential-destination";
import { restoreDeviceCredentials, type Credentials } from "./credential-manager";
import type { ProviderConfig, ProviderId, Settings } from "./types";
import type { createWorkspaceSession } from "./workspace-session";

export function useCredentialState(settings: Settings, session: ReturnType<typeof createWorkspaceSession>, signal: AbortSignal, notify: (text: string) => void) {
  const [secrets, setSecrets] = useState<Credentials>({});
  const [credentialInput, setCredentialInput] = useState<SessionCredential & { provider: ProviderId }>();
  const [saveKey, setSaveKey] = useState(true);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => restoreDeviceCredentials(settings, session, signal, (provider, credential) => {
    setSecrets((previous) => previous[provider] ? previous : { ...previous, [provider]: credential });
  }, () => notify("Could not restore the saved key. Enter it again in Providers.")), [settings.vaults, settings.providers, session, signal, notify]);
  const credentialRevision = useRef(0);
  const previousSecrets = useRef(secrets);
  if (previousSecrets.current !== secrets) {
    previousSecrets.current = secrets;
    credentialRevision.current++;
  }
  const remember = (provider: ProviderId, credential?: SessionCredential) => setSecrets((previous) => ({ ...previous, [provider]: credential }));
  const clearCredentials = () => setSecrets({});
  const resetProviderForm = () => { setCredentialInput(undefined); setSaveKey(true); setShowKey(false); };
  const inputFor = (config: Readonly<ProviderConfig>) => credentialInput?.provider === config.id ? credentialFor(config, credentialInput) : "";
  const setInputFor = (config: Readonly<ProviderConfig>, value: string) => {
    const destination = credentialDestination(config);
    setCredentialInput(value && destination ? { destination, value, provider: config.id } : undefined);
  };
  return { secrets, credentialInput, credentialRevision, saveKey, setSaveKey, showKey, setShowKey, remember, clearCredentials, resetProviderForm, inputFor, setInputFor };
}
