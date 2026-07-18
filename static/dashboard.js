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
        // Render List Item
        const card = document.createElement('div');
        card.className = 'zone-card';
        card.innerHTML = `
            <div class="zone-card-header">
                <span class="zone-type">${zone.disaster_type}</span>
                <span class="zone-score">Score: ${zone.priority_score.toFixed(3)}</span>
            </div>
            <div class="zone-details">
                Victims identified: ${zone.victim_count}<br>
                Location: ${zone.lat.toFixed(4)}, ${zone.lng.toFixed(4)}
            </div>
            <button class="btn-outline" onclick="markDone(${zone.id})">Mark Done</button>
        `;
        listEl.appendChild(card);

        // Render Map Marker
        if (!markers[zone.id]) {
            const marker = L.circleMarker([zone.lat, zone.lng], {
                color: zone.priority_score > 0.7 ? '#ef4444' : '#f59e0b',
                radius: 8,
                fillOpacity: 0.8
            }).addTo(map);
            
            marker.bindPopup(`
                <b>${zone.disaster_type.toUpperCase()}</b><br>
                Victims: ${zone.victim_count}<br>
                Score: ${zone.priority_score.toFixed(3)}
            `);
            markers[zone.id] = marker;
            
            // Pan to newest high priority
            if (zone.priority_score > 0.8) {
                map.flyTo([zone.lat, zone.lng], 13);
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
