let map;
let markers = {};

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Leaflet map
    map = L.map('map').setView([28.6139, 77.2090], 10); // Default to Delhi

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Initial fetch
    fetchZones();

    // Poll every 3 seconds
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
        updateDashboard(data.zones);
    } catch (err) {
        console.error('Error fetching zones:', err);
    }
}

function updateDashboard(zones) {
    const listEl = document.getElementById('zones-list');
    listEl.innerHTML = '';
    
    // Track current IDs to remove stale markers
    const currentIds = new Set(zones.map(z => z.id));
    
    // Remove markers that are marked done
    for (const id in markers) {
        if (!currentIds.has(parseInt(id))) {
            map.removeLayer(markers[id]);
            delete markers[id];
        }
    }

    if (zones.length === 0) {
        listEl.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">No active zones</div>';
        return;
    }

    zones.forEach(zone => {
        // Calculate AI Decision based on XGBoost score
        let aiDecision = "Low Priority";
        let decisionColor = "var(--success)";
        if (zone.priority_score >= 0.7) {
            aiDecision = "CRITICAL - IMMEDIATE DISPATCH";
            decisionColor = "var(--danger)";
        } else if (zone.priority_score >= 0.4) {
            aiDecision = "MODERATE - STANDBY";
            decisionColor = "#f59e0b"; // Warning amber
        }

        // Render List Item
        const card = document.createElement('div');
        card.className = 'zone-card';
        card.innerHTML = `
            <div class="zone-card-header">
                <span class="zone-type">${zone.severity_label}</span>
                <span class="zone-score" title="XGBoost Priority Score">AI Score: ${(zone.priority_score * 100).toFixed(1)}%</span>
            </div>
            <div class="zone-details">
                <strong style="color: ${decisionColor}; display: block; margin-bottom: 0.5rem; font-size: 1rem;">&#9889; AI Action: ${aiDecision}</strong>
                Victims identified: ${zone.victim_count}<br>
                Location: ${zone.lat.toFixed(4)}, ${zone.long.toFixed(4)}
            </div>
            <button class="btn-outline" onclick="markDone(${zone.id})" style="margin-top: 0.5rem;">Mark as Rescued</button>
        `;
        listEl.appendChild(card);

        // Render Map Marker
        if (!markers[zone.id]) {
            const marker = L.circleMarker([zone.lat, zone.long], {
                color: zone.priority_score > 0.7 ? '#ef4444' : (zone.priority_score > 0.4 ? '#f59e0b' : '#22c55e'),
                radius: 8,
                fillOpacity: 0.8
            }).addTo(map);
            
            marker.bindPopup(`
                <b>${zone.severity_label.toUpperCase()}</b><br>
                Victims: ${zone.victim_count}<br>
                Score: ${zone.priority_score.toFixed(3)}
            `);
            markers[zone.id] = marker;
            
            // Pan to newest high priority
            if (zone.priority_score > 0.8) {
                map.flyTo([zone.lat, zone.long], 13);
            }
        }
    });
}

async function markDone(id) {
    try {
        await fetch(`/api/zone/${id}`, { method: 'PATCH' });
        // Optimistic UI update
        fetchZones();
    } catch (err) {
        console.error('Error marking done:', err);
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
}
