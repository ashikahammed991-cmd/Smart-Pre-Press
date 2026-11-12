// Offline licence keys: a key is  SPP1.<payload>.<signature>  (base64url). The payload is a small
// JSON text, the signature is Ed25519 made with your PRIVATE key (tools/License-Maker.html), and the
// app checks it with the public key in license-public.ts. Nothing is sent over the internet.

import { PUBLIC_KEY_B64 } from "./license-public";

export const TRIAL_DAYS = 7;
const DAY = 86_400_000;
const K_START = "spp-trial-start";
const K_SEEN = "spp-last-seen";
const K_KEY = "spp-license";

export interface LicensePayload {
  /** customer name */
  n: string;
  /** "L" lifetime, "M" limited (monthly) */
  t: "L" | "M";
  /** issue date YYYY-MM-DD */
  i: string;
  /** last valid day YYYY-MM-DD ("" for lifetime) */
  e: string;
}

export interface LicenseState {
  status: "licensed" | "trial" | "expired" | "unconfigured";
  /** days left (trial or monthly licence), undefined for lifetime */
  daysLeft?: number;
  type?: "lifetime" | "monthly";
  name?: string;
  until?: string;
  message: string;
}

function b64uToBytes(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function store(k: string, v?: string): string | null {
  try {
    if (v !== undefined) localStorage.setItem(k, v);
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

/** Checks the signature of a key and returns its payload, or null when it is not genuine. */
export async function verifyKey(key: string): Promise<LicensePayload | null> {
  if (!PUBLIC_KEY_B64) return null;
  try {
    const parts = key.trim().replace(/\s+/g, "").split(".");
    if (parts.length !== 3 || parts[0] !== "SPP1") return null;
    const payloadBytes = b64uToBytes(parts[1]);
    const sig = b64uToBytes(parts[2]);
    const pub = await crypto.subtle.importKey("raw", b64uToBytes(PUBLIC_KEY_B64) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, pub, sig as BufferSource, payloadBytes as BufferSource);
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(payloadBytes)) as LicensePayload;
    if ((p.t !== "L" && p.t !== "M") || typeof p.n !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

function dayEnd(date: string): number {
  return new Date(date + "T23:59:59").getTime();
}

/** The current state: licensed, trial (7 days from the first start), expired. */
export async function checkLicense(now = Date.now()): Promise<LicenseState> {
  if (!PUBLIC_KEY_B64) return { status: "unconfigured", message: "Licence system is not set up yet (no public key)." };

  // clock check: the date must not go back
  const seen = Number(store(K_SEEN) ?? "0");
  const tampered = seen > 0 && now < seen - DAY * 1.5;
  if (!tampered) store(K_SEEN, String(Math.max(seen, now)));

  const key = store(K_KEY);
  if (key) {
    const p = await verifyKey(key);
    if (p) {
      if (p.t === "L") return { status: "licensed", type: "lifetime", name: p.n, message: `Licensed to ${p.n} – lifetime` };
      const end = dayEnd(p.e);
      if (!tampered && now <= end) {
        const left = Math.max(0, Math.ceil((end - now) / DAY));
        return { status: "licensed", type: "monthly", name: p.n, until: p.e, daysLeft: left, message: `Licensed to ${p.n} – valid until ${p.e} (${left} days left)` };
      }
      return { status: "expired", type: "monthly", name: p.n, until: p.e, message: tampered ? "The computer date was set back. Correct the date, or enter a licence key." : `The licence ended on ${p.e}. Enter a new key.` };
    }
  }

  let start = Number(store(K_START) ?? "0");
  if (!start) {
    start = now;
    store(K_START, String(start));
  }
  if (tampered) return { status: "expired", message: "The computer date was set back. Correct the date, or enter a licence key." };
  const used = Math.floor((now - start) / DAY);
  const left = TRIAL_DAYS - used;
  if (left > 0) return { status: "trial", daysLeft: left, message: `Trial: ${left} day${left === 1 ? "" : "s"} left` };
  return { status: "expired", message: "The 7-day trial has ended. Enter a licence key to continue." };
}

/** Checks a typed key and, when it is genuine and still valid, remembers it. */
export async function activate(key: string, now = Date.now()): Promise<{ ok: boolean; message: string }> {
  const p = await verifyKey(key);
  if (!p) return { ok: false, message: "This key is not valid. Check that it is copied completely." };
  if (p.t === "M" && now > dayEnd(p.e)) return { ok: false, message: `This key ended on ${p.e}.` };
  store(K_KEY, key.trim().replace(/\s+/g, ""));
  return { ok: true, message: p.t === "L" ? `Activated for ${p.n} – lifetime.` : `Activated for ${p.n} until ${p.e}.` };
}
