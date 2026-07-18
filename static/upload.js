let map;
let marker;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize map for picking location
    map = L.map('picker-map').setView([28.6139, 77.2090], 10);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Click to place marker
    map.on('click', (e) => {
        if (marker) {
            map.removeLayer(marker);
        }
        marker = L.marker(e.latlng).addTo(map);
        document.getElementById('lat').value = e.latlng.lat.toFixed(6);
        document.getElementById('lng').value = e.latlng.lng.toFixed(6);
    });

    const uploadForm = document.getElementById('upload-form');
    const resultDiv = document.getElementById('result-message');

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!document.getElementById('lat').value) {
            resultDiv.style.color = 'var(--danger)';
            resultDiv.textContent = 'Please select a location on the map first.';
            return;
        }

        const formData = new FormData(uploadForm);
        
        const btn = uploadForm.querySelector('button');
        const originalText = btn.textContent;
        btn.textContent = 'Processing...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/detect', {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            
            if (res.ok) {
                resultDiv.style.color = 'var(--success)';
                resultDiv.innerHTML = `
                    Detected: ${data.results.disaster_type}<br>
                    Victims: ${data.results.victim_count}<br>
                    Priority Score: ${data.results.priority_score}
                `;
                uploadForm.reset();
                if (marker) map.removeLayer(marker);
                document.getElementById('lat').value = '';
                document.getElementById('lng').value = '';
            } else {
                resultDiv.style.color = 'var(--danger)';
                resultDiv.textContent = data.detail || 'Upload failed';
            }
        } catch (err) {
            resultDiv.style.color = 'var(--danger)';
            resultDiv.textContent = 'Network error occurred';
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
});
