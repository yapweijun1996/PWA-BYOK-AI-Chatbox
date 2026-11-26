import { useEffect, useRef, useState } from "react";
import type { Backup } from "./data-contracts";
import type { ExportPlan } from "./backup";
import type { Conversation, Settings } from "./types";
import type { WorkspaceView } from "./settings-sections";

export type BackupPreview = Backup & { existing: Map<string, Conversation>; previousSettings: Settings };

export function useBackupState(view: WorkspaceView) {
  const [exportPlan, setExportPlan] = useState<ExportPlan | null>(null);
  // A chosen export stays available while the user remains in this view.
  useEffect(() => setExportPlan(null), [view]);
  const [importPreview, setImportPreview] = useState<BackupPreview | null>(null);
  const [importPreferences, setImportPreferences] = useState(false);
  const importing = useRef(false);
  const fileSelection = useRef(0);
  const importInput = useRef<HTMLInputElement>(null);
  const resetBackup = () => {
    setImportPreview(null);
    setImportPreferences(false);
    if (importInput.current) importInput.current.value = "";
    setExportPlan(null);
  };
  return { exportPlan, setExportPlan, importPreview, setImportPreview, importPreferences, setImportPreferences, importing, fileSelection, importInput, resetBackup };
}
