const DATA = {
  A: {label:'Direction A — Precision Retail', screens:{W1:['W1-application-shell.png','W1 — Application shell'],W2:['W2-cashier-workspace.png','W2 — Cashier workspace'],W3:['W3-split-payment-reconciliation.png','W3 — Split-payment reconciliation'],W4:['W4-inventory.png','W4 — Inventory'],W5:['W5-customer-credit.png','W5 — Customer credit'],W6:['W6-transaction-recovery.png','W6 — Transaction recovery'],W7:['W7-business-onboarding.png','W7 — Business onboarding']}, dir:'direction-a'},
  B: {label:'Direction B — Refined Commerce', screens:{W1:['W1-application-shell.png','W1 — Application shell'],W2:['W2-cashier-workspace.png','W2 — Cashier workspace'],W3:['W3-split-payment-reconciliation.png','W3 — Split-payment reconciliation'],W4:['W4-inventory.png','W4 — Inventory'],W5:['W5-customer-credit.png','W5 — Customer credit'],W6:['W6-transaction-recovery.png','W6 — Transaction recovery'],W7:['W7-business-onboarding.png','W7 — Business onboarding']}, dir:'direction-b'},
  android: {label:'Android companion', screens:{A1:['A1-shop-overview.png','A1 — Shop overview'],A2:['A2-inventory-overview.png','A2 — Inventory overview'],A3:['A3-customer-balances.png','A3 — Customer balances'],A4:['A4-activity.png','A4 — Activity'],A5:['A5-connectivity-and-sync-status.png','A5 — Connectivity and sync status']}, dir:'android/previews'}
};
function setView(dir, screen){
  const cfg = DATA[dir] || DATA.A;
  const item = cfg.screens[screen] || cfg.screens[Object.keys(cfg.screens)[0]];
  const base = dir === 'android' ? 'assets/android/previews/' : 'assets/windows/' + cfg.dir + '/';
  const img = document.getElementById('preview');
  img.src = base + item[0];
  img.alt = item[1] + ' — design prototype, not production software';
  document.getElementById('caption').textContent = cfg.label + ' · ' + item[1] + ' · DESIGN PROTOTYPE — NOT PRODUCTION SOFTWARE · SYNTHETIC DATA';
  document.querySelectorAll('[data-direction]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.direction === dir)));
  document.querySelectorAll('[data-screen]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.screen === screen)));
  location.hash = dir + '-' + screen;
}
function fromHash(){ const m = (location.hash || '#A-W2').slice(1).split('-'); setView(m[0], m.slice(1).join('-')); }
window.addEventListener('hashchange', fromHash);
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-direction]').forEach(b => b.addEventListener('click', () => setView(b.dataset.direction, b.dataset.defaultScreen)));
  document.querySelectorAll('[data-screen]').forEach(b => b.addEventListener('click', () => setView(b.dataset.dir, b.dataset.screen)));
  fromHash();
});
