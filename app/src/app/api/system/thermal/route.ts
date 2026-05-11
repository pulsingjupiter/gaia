/**
 * GET /api/system/thermal
 *
 * Thermal + power snapshot for the Overview thermal widget. Wraps the
 * `macmon serve` HTTP endpoint (Apple Silicon SMC reader) at
 * http://127.0.0.1:9090/json and combines it with `pmset -g therm`.
 *
 * Shape on success:
 *   { available: true, cpu_temp_c, gpu_temp_c, cpu_usage_pct, gpu_usage_pct,
 *     power_w, ram_usage_gb, ram_total_gb, chip_name, thermal_pressure,
 *     timestamp }
 *
 * Shape when macmon isn't reachable:
 *   { available: false, install_hint, reason }
 *
 * Port is overridable via GAIA_MACMON_PORT (default 9090).
 */
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MACMON_TIMEOUT_MS = 1500;
const PMSET_TIMEOUT_MS = 1000;
const INSTALL_HINT = "brew install macmon && macmon serve --install";

type ThermalPressure = "Nominal" | "Moderate" | "Heavy" | "Unknown";

type MacmonJson = {
  cpu_usage_pct: number;
  gpu_usage: [number, number];
  sys_power: number;
  memory: {
    ram_total: number;
    ram_usage: number;
  };
  soc: {
    chip_name: string;
  };
  temp: {
    cpu_temp_avg: number;
    gpu_temp_avg: number;
  };
  timestamp: string;
};

type ThermalOk = {
  available: true;
  cpu_temp_c: number;
  gpu_temp_c: number;
  cpu_usage_pct: number;
  gpu_usage_pct: number;
  power_w: number;
  ram_usage_gb: number;
  ram_total_gb: number;
  chip_name: string;
  thermal_pressure: ThermalPressure;
  timestamp: string;
};

type ThermalUnavailable = {
  available: false;
  install_hint: string;
  reason: string;
};

export type ThermalResponse = ThermalOk | ThermalUnavailable;

function macmonPort(): number {
  const raw = process.env.GAIA_MACMON_PORT;
  if (!raw) return 9090;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 9090;
}

async function fetchMacmon(port: number): Promise<MacmonJson | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MACMON_TIMEOUT_MS);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return { error: `macmon /json returned HTTP ${res.status}` };
    }
    const data = (await res.json()) as MacmonJson;
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (ctrl.signal.aborted) {
      return { error: `macmon /json timed out after ${MACMON_TIMEOUT_MS}ms` };
    }
    return { error: `macmon not reachable on port ${port}: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

function readThermalPressure(): Promise<ThermalPressure> {
  return new Promise((resolve) => {
    const child = spawn("pmset", ["-g", "therm"]);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, PMSET_TIMEOUT_MS);
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve("Unknown");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve("Unknown");
        return;
      }
      const combined = `${stdout}\n${stderr}`;
      const match = combined.match(/Current Thermal Level\s*=\s*(.+)/i);
      if (match) {
        const v = match[1].trim();
        if (v === "Nominal" || v === "Moderate" || v === "Heavy") {
          resolve(v);
          return;
        }
        resolve("Unknown");
        return;
      }
      // pmset prints "No thermal warning level has been recorded" when fine.
      if (/No thermal warning level has been recorded/i.test(combined)) {
        resolve("Nominal");
        return;
      }
      resolve("Nominal");
    });
  });
}

const BYTES_PER_GB = 1024 ** 3;

function toGb(bytes: number): number {
  return Math.round((bytes / BYTES_PER_GB) * 10) / 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function GET(): Promise<Response> {
  const port = macmonPort();
  const [macmonResult, thermalPressure] = await Promise.all([
    fetchMacmon(port),
    readThermalPressure(),
  ]);

  if ("error" in macmonResult) {
    const payload: ThermalUnavailable = {
      available: false,
      install_hint: INSTALL_HINT,
      reason: macmonResult.error,
    };
    return Response.json(payload);
  }

  const m = macmonResult;
  const payload: ThermalOk = {
    available: true,
    cpu_temp_c: round1(m.temp.cpu_temp_avg),
    gpu_temp_c: round1(m.temp.gpu_temp_avg),
    cpu_usage_pct: round1(m.cpu_usage_pct * 100),
    gpu_usage_pct: round1(m.gpu_usage[1] * 100),
    power_w: round1(m.sys_power),
    ram_usage_gb: toGb(m.memory.ram_usage),
    ram_total_gb: toGb(m.memory.ram_total),
    chip_name: m.soc.chip_name,
    thermal_pressure: thermalPressure,
    timestamp: m.timestamp,
  };
  return Response.json(payload);
}
