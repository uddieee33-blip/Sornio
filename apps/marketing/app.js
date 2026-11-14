const industries = {
  grocery: ['WINDOWS PREVIEW WORKFLOW', 'From the first scan to the next delivery.', 'Find exact saved barcodes, sell by piece or measured quantity, review udhaar and plan the next delivery from unit-specific stock thresholds.', 'Next: expiry tracking.'],
  retail: ['RETAIL CORE IN DEVELOPMENT', 'A counter for cycles and spare parts.', 'Saved SKU lookup, billing, customer credit, stock and held bills share the native retail core. Each saved sellable item has its own code, price and quantity.', 'Planned: variants, serial numbers and warranties.'],
  restaurant: ['BUSINESS PROFILE + ROADMAP', 'Give service its own rhythm.', 'Counter billing and menu items use the shared core. Table service, kitchen order tickets, modifiers and dedicated dine-in and takeaway workflows remain planned native work.', 'Planned: tables, kitchen tickets and modifiers.'],
  salon: ['BUSINESS PROFILE + ROADMAP', 'Make room for every client.', 'The shared customer and billing foundation supports the business profile. Dedicated appointment scheduling, staff service assignments and client service history remain planned native work.', 'Planned: appointments and staff assignments.'],
  gym: ['BUSINESS PROFILE + ROADMAP', 'A stronger front desk.', 'The business profile provides a foundation for member terminology. Native recurring memberships, renewals, attendance and hardware-linked check-ins remain planned.', 'Planned: memberships, renewals and attendance.']
};
const tabs = [...document.querySelectorAll('[data-industry]')];
function choose(tab, focus = false) {
  const key = tab.dataset.industry, content = industries[key]; if (!content) return;
  tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; });
  document.getElementById('industry-detail').setAttribute('aria-labelledby', tab.id);
  ['industry-status','industry-title','industry-copy','industry-next'].forEach((id,index) => { document.getElementById(id).textContent = content[index]; });
  document.querySelector('.industry-symbol').textContent = String(tabs.indexOf(tab) + 1).padStart(2,'0');
  if (focus) tab.focus();
}
tabs.forEach(tab => { tab.addEventListener('click', () => choose(tab)); tab.addEventListener('keydown', event => {
  const index = tabs.indexOf(tab); let next;
  if (['ArrowRight','ArrowDown'].includes(event.key)) next = (index + 1) % tabs.length;
  if (['ArrowLeft','ArrowUp'].includes(event.key)) next = (index + tabs.length - 1) % tabs.length;
  if (event.key === 'Home') next = 0; if (event.key === 'End') next = tabs.length - 1;
  if (next !== undefined) { event.preventDefault(); choose(tabs[next], true); }
}); });
/** Only an explicitly verified release from the official repository enables distribution. */
function applyRelease(manifest) {
  const r = manifest?.windows; if (!r || r.status !== 'verified' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(r.version) || !/^[a-f0-9]{64}$/i.test(r.sha256)) return;
  const url = new URL(r.url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || !url.pathname.startsWith('/uddieee33-blip/Sornio/releases/download/') || !url.pathname.endsWith('.exe')) return;
  const link = document.getElementById('windows-download'); link.href = url.href; link.removeAttribute('aria-disabled'); link.textContent = `Download Sornio ${r.version} for Windows ↗`;
  document.getElementById('release-status').textContent = `Verified official Windows release · SHA-256 ${r.sha256}`;
}
fetch('release-manifest.json').then(response => { if (!response.ok) throw new Error('No release manifest'); return response.json(); }).then(applyRelease).catch(() => { /* Keep the download unavailable if release metadata cannot be loaded. */ });
