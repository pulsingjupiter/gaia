"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SectionPanel,
  FieldRow,
  TextInput,
  PrimaryButton,
  SecondaryButton,
} from "./settings-shell";
import { Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react";

type Status = {
  running: boolean;
  pid?: number;
};

type TestResult = {
  ok: boolean;
  bot?: {
    id: number;
    username: string;
    first_name: string;
  };
  error?: string;
};

export function TelegramSection() {
  const [token, setToken] = useState("");
  const [maskedToken, setMaskedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [chatIds, setChatIds] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings/telegram");
    if (res.ok) {
      const data = await res.json();
      setMaskedToken(data.token_masked);
      setChatIds(data.allowed_chat_ids);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/settings/telegram/status");
    if (res.ok) {
      setStatus(await res.json());
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
    void fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchSettings, fetchStatus]);

  const handleSave = async () => {
    setIsSaving(true);
    await fetch("/api/settings/telegram", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token || null, allowed_chat_ids: chatIds }),
    });
    await fetchSettings();
    setToken("");
    setIsSaving(false);
  };
  
  const handleSaveChatIds = async () => {
    setIsSaving(true);
    await fetch("/api/settings/telegram", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_chat_ids: chatIds }),
    });
    await fetchSettings();
    setIsSaving(false);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const url = token
      ? `/api/settings/telegram/test?token=${encodeURIComponent(token)}`
      : "/api/settings/telegram/test";
    const res = await fetch(url, { method: "POST" });
    setTestResult(await res.json());
    setIsTesting(false);
  };

  const handleOpenTerminal = async () => {
    await fetch("/api/system/open-bot-terminal", { method: "POST" });
  };

  return (
    <SectionPanel title="Telegram Bot" description="Configure the Telegram bot for Gaia.">
      <div className="flex flex-col gap-4">
        <FieldRow
          label="Bot Token"
          hint="From @BotFather on Telegram."
        >
          <div className="flex items-center gap-2">
            <div className="relative w-full">
              <TextInput
                type={showToken ? "text" : "password"}
                placeholder={maskedToken || "Enter your bot token"}
                value={token}
                onChange={setToken}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted"
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <SecondaryButton onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" size={14} /> : "Save"}
            </SecondaryButton>
          </div>
        </FieldRow>

        <FieldRow
          label="Allow-listed Chat IDs"
          hint="Comma-separated numeric IDs."
        >
           <div className="flex items-center gap-2">
            <TextInput
                placeholder="e.g. 12345678, 87654321"
                value={chatIds}
                onChange={setChatIds}
                />
            <SecondaryButton onClick={handleSaveChatIds} disabled={isSaving}>
                {isSaving ? <Loader2 className="animate-spin" size={14} /> : "Save"}
            </SecondaryButton>
          </div>
        </FieldRow>

        <div className="grid grid-cols-1 gap-2 py-2 md:grid-cols-[180px,1fr] md:gap-4 md:py-3">
          <div></div>
          <div>
            <SecondaryButton
              onClick={handleTestConnection}
              disabled={!token && !maskedToken}
            >
              {isTesting ? (
                <>
                  <Loader2 className="animate-spin" size={14} /> Testing...
                </>
              ) : (
                "Test Connection"
              )}
            </SecondaryButton>
            {testResult && (
              <div className="mt-2 text-xs flex items-center gap-2">
                {testResult.ok ? (
                  <>
                    <CheckCircle size={14} className="text-green-500" />
                    <span>
                      Connected to @{testResult.bot?.username} (
                      {testResult.bot?.first_name})
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle size={14} className="text-red-500" />
                    <span>{testResult.error}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <FieldRow label="Bot Status">
          <div className="flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                status?.running ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            <span className="text-xs text-muted">
              {status ? (
                status.running ? (
                  `Bot running (PID ${status.pid})`
                ) : (
                  "Bot not running"
                )
              ) : (
                <Loader2 className="animate-spin" size={12} />
              )}
            </span>
          </div>
        </FieldRow>

        <div className="grid grid-cols-1 gap-2 py-2 md:grid-cols-[180px,1fr] md:gap-4 md:py-3">
          <div></div>
          <div>
            <PrimaryButton
              onClick={handleOpenTerminal}
              disabled={!maskedToken || !chatIds}
            >
              Open Terminal & Start Bot
            </PrimaryButton>
          </div>
        </div>
        
        <div className="text-xs text-muted p-4 bg-surface-muted rounded-lg">
          <h4 className="font-semibold text-primary mb-2">How to set up</h4>
          <ol className="list-decimal list-inside space-y-1">
            <li>Message <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-accent underline">@BotFather</a> on Telegram and use the <code>/newbot</code> command.</li>
            <li>Copy the token he gives you and paste it above.</li>
            <li>
              To find your chat ID, send any message to your new bot, then visit this URL in your browser (replace TOKEN):<br/>
              <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>
            </li>
            <li>Look for the <code>{`"chat":{"id":123...}`}</code> value in the response.</li>
          </ol>
        </div>
      </div>
    </SectionPanel>
  );
}
