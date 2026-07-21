/* =============================================
   DASHBOARD.JS — Disaster Saviour
   4-Tier Zone Severity System:
     CRITICAL (>= 0.75) → RED
     HIGH     (>= 0.50) → ORANGE
     MEDIUM   (>= 0.25) → YELLOW
     LOW      (<  0.25) → GREEN
     RESCUED            → GREY (with green check)
   ============================================= */

let map;
let markers = {};

/* ── Map Init ── */
document.addEventListener('DOMContentLoaded', () => {
    map = L.map('map', { zoomControl: false }).setView([28.6139, 77.2090], 9);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd', maxZoom: 20
    }).addTo(map);
    fetchZones();
    setInterval(fetchZones, 4000);
});

/* ── Helpers ── */
function getSev(score) {
    if (score >= 0.75) return 'critical';
    if (score >= 0.50) return 'high';
    if (score >= 0.25) return 'medium';
    return 'low';
}

const SEV_COLOR = {
    critical: '#ff1a3c', high: '#ff7b00', medium: '#ffd600', low: '#00e676', rescued: '#2a4a6a'
};
const SEV_LABEL = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
const SEV_ICON  = { critical: 'ph-fill ph-warning', high: 'ph-fill ph-fire', medium: 'ph-fill ph-warning-circle', low: 'ph-fill ph-shield-check' };
const AI_DECISION = { critical: 'IMMEDIATE DISPATCH REQUIRED', high: 'PRIORITY RESPONSE', medium: 'MONITOR & STANDBY', low: 'LOW RISK — OBSERVE' };

/* ── Map marker ── */
function createMarker(zone, isRescued) {
    const lv = isRescued ? 'rescued' : getSev(zone.priority_score);
    // Rescued zones → bright green; active zones → their severity color
    const col = isRescued ? '#00e676' : SEV_COLOR[lv];
    const r = isRescued ? 9 : (lv === 'critical' ? 12 : lv === 'high' ? 10 : 8);
    const marker = L.circleMarker([zone.lat, zone.long], {
        color: isRescued ? '#00e676' : col,
        fillColor: isRescued ? '#00e676' : col,
        radius: r,
        weight: isRescued ? 2 : 2,
        fillOpacity: isRescued ? 0.55 : 0.65,
        opacity: 1,
        dashArray: isRescued ? '4 3' : null  // dashed border for rescued
    });
    const popupHtml = `
        <div style="font-family:'Outfit',sans-serif;min-width:160px;">
            <div style="font-weight:700;font-size:0.9rem;text-transform:uppercase;color:${col};margin-bottom:0.5rem;letter-spacing:0.5px;">
                ${isRescued ? '✓ RESCUED' : (SEV_LABEL[lv] || 'ZONE')}
            </div>
            <div style="font-size:0.78rem;line-height:1.7;color:#5a8fbb;">
                <div>Severity: <strong style="color:${col};">${zone.severity_label}</strong></div>
                <div>Victims: <strong style="color:#e8f4ff;">${zone.victim_count}</strong></div>
                <div>AI Score: <strong style="color:${col};">${(zone.priority_score*100).toFixed(1)}%</strong></div>
                <div style="font-size:0.68rem;color:#2a4a6a;margin-top:0.3rem;">${zone.lat.toFixed(4)}, ${zone.long.toFixed(4)}</div>
            </div>
            ${isRescued ? `<div style="margin-top:0.5rem;text-align:center;font-size:0.78rem;color:#00e676;font-weight:700;">✅ Zone Rescued</div>` : `<button onclick="markDone(${zone.id})" style="margin-top:0.5rem;width:100%;padding:0.4rem;border-radius:6px;background:transparent;border:1px solid rgba(0,230,118,0.4);color:#00e676;font-size:0.72rem;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:700;text-transform:uppercase;">✓ Mark Rescued</button>`}
        </div>`;
    marker.bindPopup(popupHtml, { maxWidth: 220 });
    return marker;
}

/* ── Fetch zones ── */
async function fetchZones() {
    try {
        const res = await fetch('/api/zones');
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();
        updateDashboard(data.active_zones || [], data.rescued_zones || []);
    } catch (err) { console.error('Error fetching zones:', err); }
}

/* ── Update dashboard ── */
function updateDashboard(activeZones, rescuedZones) {
    // Severity counts
    let crit=0, high=0, med=0;
    activeZones.forEach(z => {
        const lv=getSev(z.priority_score);
        if(lv==='critical')crit++; else if(lv==='high')high++; else if(lv==='medium')med++;
    });
    setEl('count-critical', crit);
    setEl('count-high', high);
    setEl('count-medium', med);
    setEl('count-rescued', rescuedZones.length);
    setEl('count-total', activeZones.length);
    setEl('active-badge', `${activeZones.length} zone${activeZones.length!==1?'s':''}`);
    setEl('rescued-badge', `${rescuedZones.length} rescued`);

    // Lists
    updateZoneList('zones-list', activeZones, false);
    updateRescuedList('rescued-list', rescuedZones);

    // Map markers
    const allIds = new Set([...activeZones, ...rescuedZones].map(z => z.id));
    Object.keys(markers).forEach(id => {
        if (!allIds.has(parseInt(id))) { map.removeLayer(markers[id]); delete markers[id]; }
    });

    activeZones.forEach(zone => {
        if (!markers[zone.id]) {
            const m = createMarker(zone, false);
            m.addTo(map);
            markers[zone.id] = m;
            if (zone.priority_score >= 0.75 && Object.keys(markers).length <= 3) {
                map.flyTo([zone.lat, zone.long], 12, { duration: 1.5 });
            }
        }
    });

    rescuedZones.forEach(zone => {
        if (markers[zone.id]) {
            // Update existing marker to green rescued style
            markers[zone.id].setStyle({
                color: '#00e676', fillColor: '#00e676',
                fillOpacity: 0.55, opacity: 1, radius: 9, dashArray: '4 3'
            });
        } else {
            const m = createMarker(zone, true);
            m.addTo(map);
            markers[zone.id] = m;
        }
    });
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

/* ── Active zone list ── */
function updateZoneList(listId, zones, isRescued) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    const existingCards = Array.from(listEl.querySelectorAll('.zone-card'));
    const currentIds = new Set(zones.map(z => z.id));

    existingCards.forEach(card => {
        const id = parseInt(card.dataset.id);
        if (id && !currentIds.has(id) && !card.classList.contains('removing')) {
            card.classList.add('removing');
            card.addEventListener('animationend', () => card.remove(), { once: true });
        }
    });

    const emptyEl = listEl.querySelector('.empty-state');
    if (zones.length === 0) {
        if (!emptyEl) {
            listEl.innerHTML = `<div class="empty-state">
                <i class="ph-fill ph-check-circle" style="color:var(--zone-green);font-size:2.5rem;opacity:0.5;"></i>
                <span>No active zones</span><span style="font-size:0.75rem;color:var(--text-muted);">All clear</span>
            </div>`;
        }
        return;
    }
    if (emptyEl) emptyEl.remove();

    zones.forEach((zone, idx) => {
        let card = listEl.querySelector(`.zone-card[data-id="${zone.id}"]`);
        if (!card) {
            card = buildZoneCard(zone, false);
            const siblings = listEl.querySelectorAll('.zone-card:not(.removing)');
            if (siblings[idx]) listEl.insertBefore(card, siblings[idx]);
            else listEl.appendChild(card);
        }
    });
}

/* ── Rescued log ── */
function updateRescuedList(listId, zones) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    const emptyEl = listEl.querySelector('.empty-state');
    if (zones.length === 0) {
        if (!emptyEl) listEl.innerHTML = `<div class="empty-state"><i class="ph ph-clipboard-text"></i><span>No completed missions</span></div>`;
        return;
    }
    if (emptyEl) emptyEl.remove();
    const existingIds = new Set(Array.from(listEl.querySelectorAll('.rescue-item')).map(el => parseInt(el.dataset.id)));
    zones.forEach(zone => {
        if (!existingIds.has(zone.id)) {
            const item = document.createElement('div');
            item.className = 'rescue-item'; item.dataset.id = zone.id;
            const ts = zone.timestamp ? new Date(zone.timestamp+'Z').toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
            item.innerHTML = `
                <div class="rescue-check"><i class="ph-bold ph-check"></i></div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.8rem;color:var(--text-primary);text-transform:capitalize;">Zone #${zone.id} — ${zone.severity_label}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${zone.victim_count} victim(s) · ${ts}</div>
                </div>
                <span class="zone-severity-badge" style="font-size:0.65rem;padding:0.15rem 0.5rem;color:var(--zone-green);background:var(--zone-green-dim);border-color:rgba(0,230,118,0.25);">
                    <i class="ph-bold ph-check-circle"></i> SAVED
                </span>`;
            listEl.insertBefore(item, listEl.firstChild);
        }
    });
}

/* ── Build zone card ── */
function buildZoneCard(zone, isRescued) {
    const lv = getSev(zone.priority_score);
    const col = SEV_COLOR[lv];
    const icon = SEV_ICON[lv];
    const label = SEV_LABEL[lv] || zone.severity_label;
    const decision = AI_DECISION[lv];

    const card = document.createElement('div');
    card.className = `zone-card${isRescued?' rescued':''}`;
    card.dataset.id = zone.id;
    card.dataset.sev = isRescued ? 'rescued' : lv;
    card.setAttribute('role','listitem');

    card.innerHTML = `
        <div class="zone-card-top">
            <span class="zone-severity-badge"><i class="${icon}"></i> ${label}</span>
            <span class="zone-score-chip">${(zone.priority_score*100).toFixed(1)}%</span>
        </div>
        <div class="zone-name"><i class="${icon}" style="color:${col};margin-right:0.3rem;"></i>${zone.severity_label?zone.severity_label.charAt(0).toUpperCase()+zone.severity_label.slice(1):'Unknown'} Zone</div>
        <div class="zone-meta">
            <div class="zone-meta-item"><i class="ph-bold ph-users" style="color:${col};"></i><span>${zone.victim_count} victim${zone.victim_count!==1?'s':''}</span></div>
            <div class="zone-meta-item" style="color:${col};font-weight:600;"><i class="ph-bold ph-lightning"></i><span>${decision}</span></div>
        </div>
        <div class="zone-coords"><i class="ph ph-map-pin"></i> ${zone.lat.toFixed(4)}, ${zone.long.toFixed(4)}</div>
        ${!isRescued?`<button class="btn-rescue" onclick="markDone(${zone.id})" id="rescue-btn-${zone.id}"><i class="ph-bold ph-check-circle"></i> Mark as Rescued</button>`:''}`;

    card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        map.flyTo([zone.lat, zone.long], 13, { duration: 1 });
        if (markers[zone.id]) markers[zone.id].openPopup();
    });
    return card;
}

/* ── Mark Rescued ── */
async function markDone(id) {
    const btn = document.getElementById(`rescue-btn-${id}`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Marking...'; }
    try {
        const res = await fetch(`/api/zone/${id}`, { method: 'PATCH' });
        if (res.ok) {
            // Remove from active zone card list
            const card = document.querySelector(`.zone-card[data-id="${id}"]`);
            if (card) { card.classList.add('removing'); card.addEventListener('animationend', () => card.remove(), { once: true }); }
            // Immediately turn marker GREEN on map
            if (markers[id]) {
                markers[id].setStyle({
                    color: '#00e676', fillColor: '#00e676',
                    fillOpacity: 0.55, opacity: 1, radius: 9, dashArray: '4 3'
                });
                // Update popup to show rescued state
                markers[id].setPopupContent(`
                    <div style="font-family:'Outfit',sans-serif;min-width:160px;">
                        <div style="font-weight:700;font-size:0.9rem;text-transform:uppercase;color:#00e676;margin-bottom:0.5rem;letter-spacing:0.5px;">✓ RESCUED</div>
                        <div style="font-size:0.78rem;color:#5a8fbb;">Zone #${id} has been rescued.</div>
                        <div style="margin-top:0.5rem;text-align:center;font-size:0.78rem;color:#00e676;font-weight:700;">✅ Zone Rescued</div>
                    </div>`);
            }
        }
    } catch (err) {
        console.error('Error:', err);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-check-circle"></i> Mark as Rescued'; }
    }
}

/* ── Logout ── */
async function logout() {
    try { await fetch('/api/logout', { method: 'POST' }); } finally { window.location.href = '/login'; }
}
