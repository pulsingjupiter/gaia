/**
 * Shared osascript helpers.
 *
 * Used by routes that need to launch a macOS terminal (Terminal.app or
 * iTerm2) and run a shell command, or that need to invoke a Finder
 * `choose folder` dialog.
 */
import { spawn } from "node:child_process";

export function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function appleScriptEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export const TERMINAL_LAUNCH_SCRIPT = (command: string): string => `
tell application "Terminal"
  activate
  do script "${appleScriptEscape(command)}"
end tell
`;

export const ITERM_LAUNCH_SCRIPT = (command: string): string => `
tell application "iTerm2"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text "${appleScriptEscape(command)}"
  end tell
end tell
`;

export type OsascriptResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
};

export function runOsascript(script: string): Promise<OsascriptResult> {
  return new Promise((resolve) => {
    const child = spawn("osascript", ["-e", script]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      resolve({ ok: false, stdout, stderr: stderr || String(err) });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}
