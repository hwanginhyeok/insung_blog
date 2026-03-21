"use client";

import { useState, useCallback } from "react";
import { BotSettings, defaultSettings, apiSaveSettings } from "../_lib/bot-api";

export interface BotSettingsState {
  settingsDraft: BotSettings;
  settingsSaving: boolean;
  settingsError: string | null;
  setSettingsDraft: React.Dispatch<React.SetStateAction<BotSettings>>;
  resetDraft: (settings: BotSettings) => void;
  handleSaveSettings: () => Promise<BotSettings | null>;
}

export function useBotSettings(
  onSaved?: (settings: BotSettings) => void
): BotSettingsState {
  const [settingsDraft, setSettingsDraft] = useState<BotSettings>(defaultSettings);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const resetDraft = useCallback((settings: BotSettings) => {
    setSettingsDraft(settings);
  }, []);

  const [settingsError, setSettingsError] = useState<string | null>(null);

  const handleSaveSettings = useCallback(async (): Promise<BotSettings | null> => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const result = await apiSaveSettings(settingsDraft);
      if (result.success && result.settings) {
        onSaved?.(result.settings);
        return result.settings;
      }
      setSettingsError(result.error || "설정 저장 실패");
      return null;
    } catch {
      setSettingsError("네트워크 오류");
      return null;
    } finally {
      setSettingsSaving(false);
    }
  }, [settingsDraft, onSaved]);

  return {
    settingsDraft,
    settingsSaving,
    settingsError,
    setSettingsDraft,
    resetDraft,
    handleSaveSettings,
  };
}
