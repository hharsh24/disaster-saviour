let map;
let markers = {};

document.addEventListener('DOMContentLoaded', () => {
    map = L.map('map', { zoomControl: false }).setView([28.6139, 77.2090], 10);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    fetchZones();
    setInterval(fetchZones, 3000);
});

async function fetchZones() {
    try {
        const res = await fetch('/api/zones');
        if (res.status === 401) {
            window.location.href = '/';
            return;
        }
        const data = await res.json();
        updateDashboard(data.active_zones || [], data.rescued_zones || []);
    } catch (err) {
        console.error('Error fetching zones:', err);
    }
}

function updateDashboard(activeZones, rescuedZones) {
    document.getElementById('active-count').textContent = activeZones.length;
    document.getElementById('rescued-count').textContent = rescuedZones.length;

    updateList('zones-list', activeZones, false);
    updateList('rescued-list', rescuedZones, true);
    
    // Map Markers
    const currentIds = new Set([...activeZones.map(z => z.id), ...rescuedZones.map(z => z.id)]);
    for (const id in markers) {
        if (!currentIds.has(parseInt(id))) {
            map.removeLayer(markers[id]);
            delete markers[id];
        }
    }

    activeZones.forEach(zone => {
        if (!markers[zone.id]) {
            const priorityColor = zone.priority_score > 0.7 ? '#ff3366' : (zone.priority_score > 0.4 ? '#ffb300' : '#00e676');
            const marker = L.circleMarker([zone.lat, zone.long], {
                color: priorityColor,
                fillColor: priorityColor,
                radius: 8,
                weight: 2,
                fillOpacity: 0.6
            }).addTo(map);
            
            marker.bindPopup(`
                <div style="font-family: 'Outfit', sans-serif; color: #000;">
                    <b style="text-transform: capitalize; font-size: 1.1rem;">${zone.severity_label}</b><br>
                    Victims: ${zone.victim_count}<br>
                    Score: ${(zone.priority_score * 100).toFixed(1)}%
                </div>
            `);
            markers[zone.id] = marker;
            
            if (zone.priority_score > 0.8) {
                map.flyTo([zone.lat, zone.long], 13, { duration: 1.5 });
            }
        }
    });

    // Update rescued markers
    rescuedZones.forEach(zone => {
        if (markers[zone.id]) {
            markers[zone.id].setStyle({
                color: '#94a3b8',
                fillColor: '#94a3b8',
                fillOpacity: 0.3
            });
        }
    });
}

function updateList(listId, zones, isRescued) {
    const listEl = document.getElementById(listId);
    const existingCards = Array.from(listEl.children);
    const currentIds = new Set(zones.map(z => z.id));

    // Remove old cards
    existingCards.forEach(card => {
        const id = parseInt(card.dataset.id);
        if (id && !currentIds.has(id) && !card.classList.contains('removing')) {
            card.classList.add('removing');
            card.addEventListener('animationend', () => {
                card.remove();
            });
        }
    });

    if (zones.length === 0 && existingCards.filter(c => !c.classList.contains('removing')).length === 0) {
        if (!listEl.querySelector('.empty-state')) {
            listEl.innerHTML = `<div class="empty-state" style="color: var(--text-secondary); text-align: center; padding: 2rem; font-size: 0.9rem;">
                <i class="ph ph-check-circle" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                ${isRescued ? 'No completed missions' : 'No active zones'}
            </div>`;
        }
        return;
    } else {
        const empty = listEl.querySelector('.empty-state');
        if (empty) empty.remove();
    }

    // Add or update cards
    zones.forEach(zone => {
        let card = listEl.querySelector(`.zone-card[data-id="${zone.id}"]`);
        
        if (!card) {
            let aiDecision = "Low Priority";
            let priorityClass = "low";
            let icon = "ph-shield-check";
            
            if (zone.priority_score >= 0.7) {
                aiDecision = "CRITICAL - IMMEDIATE DISPATCH";
                priorityClass = "high";
                icon = "ph-warning";
            } else if (zone.priority_score >= 0.4) {
                aiDecision = "MODERATE - STANDBY";
                priorityClass = "medium";
                icon = "ph-warning-circle";
            }

            card = document.createElement('div');
            card.className = `zone-card ${isRescued ? 'rescued' : ''}`;
            card.dataset.id = zone.id;
            card.dataset.priority = priorityClass;
            
            card.innerHTML = `
                <div class="zone-card-header">
                    <span class="zone-type"><i class="ph-fill ${icon}" style="color: inherit;"></i> ${zone.severity_label}</span>
                    <span class="zone-score" title="AI Priority Score"><i class="ph-bold ph-brain"></i> ${(zone.priority_score * 100).toFixed(1)}%</span>
                </div>
                <div class="zone-details">
                    <div class="detail-row" style="color: var(--${isRescued ? 'text-secondary' : (priorityClass === 'high' ? 'danger' : (priorityClass === 'medium' ? 'warning' : 'success'))}); font-weight: 600;">
                        <i class="ph-bold ph-lightning"></i> AI Action: ${aiDecision}
                    </div>
                    <div class="detail-row"><i class="ph ph-users"></i> Victims identified: ${zone.victim_count}</div>
                    <div class="detail-row"><i class="ph ph-map-pin"></i> Location: ${zone.lat.toFixed(4)}, ${zone.long.toFixed(4)}</div>
                </div>
                ${!isRescued ? `<button class="btn-outline" onclick="markDone(${zone.id})" style="margin-top: 0.5rem; padding: 0.75rem;"><i class="ph-bold ph-check"></i> Mark as Rescued</button>` : ''}
            `;
            // Append at the end (the server already sorts them)
            listEl.appendChild(card);
        }
    });
}

async function markDone(id) {
    try {
        // Optimistic UI
        const card = document.querySelector(`.zone-card[data-id="${id}"]`);
        if (card) {
            const btn = card.querySelector('button');
            if (btn) {
                btn.innerHTML = '<i class="ph-bold ph-spinner spinner" style="animation: rotate 1s linear infinite;"></i> Processing...';
                btn.disabled = true;
            }
        }
        await fetch(`/api/zone/${id}`, { method: 'PATCH' });
        fetchZones();
    } catch (err) {
        console.error('Error marking done:', err);
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
}
