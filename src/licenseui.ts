// The licence badge in the top bar and the lock screen shown when the trial or licence has ended.

import { activate, checkLicense, type LicenseState } from "./license";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, id?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (cls) e.className = cls;
  return e;
}

let overlay: HTMLDivElement;
let badge: HTMLButtonElement;
let msg: HTMLDivElement;
let box: HTMLTextAreaElement;
let locked = false;

function render(s: LicenseState): void {
  badge.textContent = s.status === "unconfigured" ? "Licence: not set up" : s.status === "licensed" ? (s.type === "lifetime" ? "Licensed ✓" : `Licensed ✓ ${s.daysLeft} d`) : s.status === "trial" ? `Trial: ${s.daysLeft} d left` : "Licence expired";
  badge.title = s.message;
  badge.className = "lic-" + s.status;
  locked = s.status === "expired";
  if (locked) {
    overlay.hidden = false;
    msg.textContent = s.message;
    msg.className = "";
  } else if (box.value === "") {
    overlay.hidden = true;
  }
}

async function refresh(): Promise<void> {
  render(await checkLicense());
}

function openDialog(): void {
  overlay.hidden = false;
  msg.textContent = badge.title;
  box.focus();
}

export function initLicenseUi(): void {
  overlay = el("div", "lic-overlay");
  overlay.hidden = true;
  const card = el("div", undefined, "lic-card");
  const h = el("h2");
  h.textContent = "Smart Pre-Press licence";
  msg = el("div", "lic-msg");
  box = el("textarea", "lic-key");
  box.rows = 4;
  box.placeholder = "Paste your licence key here (it starts with SPP1.)";
  const row = el("div", undefined, "lic-row");
  const ok = el("button", undefined, "primary");
  ok.textContent = "Activate";
  const close = el("button");
  close.textContent = "Close";
  row.append(ok, close);
  card.append(h, msg, box, row);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  badge = el("button", "lic-badge");
  const nav = document.getElementById("mainnav");
  if (nav) {
    const sp = el("span");
    sp.style.flex = "1";
    nav.append(sp, badge);
  }
  badge.addEventListener("click", openDialog);
  close.addEventListener("click", () => {
    if (!locked) overlay.hidden = true;
    else msg.textContent = "The app is locked until a valid licence key is entered.";
  });
  ok.addEventListener("click", () => {
    void (async () => {
      const r = await activate(box.value);
      msg.textContent = r.message;
      msg.className = r.ok ? "good" : "bad";
      if (r.ok) {
        box.value = "";
        await refresh();
        window.setTimeout(() => {
          if (!locked) overlay.hidden = true;
        }, 1200);
      }
    })();
  });
  void refresh();
  window.setInterval(() => void refresh(), 60 * 60 * 1000);
}
