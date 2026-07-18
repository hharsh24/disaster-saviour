document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('upload-form');
    const resultDiv = document.getElementById('result-message');

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(uploadForm);
        
        const btn = uploadForm.querySelector('button');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<svg class="spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg> Processing Intel...';
        btn.disabled = true;
        resultDiv.innerHTML = ''; 

        try {
            const res = await fetch('/api/detect', {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            
            if (res.ok) {
                resultDiv.style.color = 'var(--success)';
                resultDiv.innerHTML = `
                    <div style="background: rgba(0, 230, 118, 0.1); border: 1px solid rgba(0, 230, 118, 0.2); padding: 1.5rem; border-radius: 1rem; margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem; animation: slideIn 0.4s ease-out;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.1rem; font-weight: 700;">
                            <i class="ph-fill ph-check-circle" style="font-size: 1.5rem;"></i> Intel Processed Successfully
                        </div>
                        <div class="detail-row"><i class="ph ph-warning-circle"></i> Detected: <span style="text-transform: capitalize; font-weight: 600; margin-left: 0.25rem;">${data.results.severity_label}</span></div>
                        <div class="detail-row"><i class="ph ph-users"></i> Victims Found: <strong style="margin-left: 0.25rem;">${data.results.victim_count}</strong></div>
                        <div class="detail-row"><i class="ph ph-brain"></i> AI Priority Score: <strong style="margin-left: 0.25rem;">${(data.results.priority_score * 100).toFixed(1)}%</strong></div>
                    </div>
                `;
                uploadForm.reset();
            } else {
                resultDiv.style.color = 'var(--danger)';
                resultDiv.innerHTML = `<i class="ph-fill ph-warning-octagon" style="font-size: 1.2rem; vertical-align: middle;"></i> ${data.detail || 'Upload failed'}`;
            }
        } catch (err) {
            resultDiv.style.color = 'var(--danger)';
            resultDiv.innerHTML = '<i class="ph-fill ph-warning-octagon" style="font-size: 1.2rem; vertical-align: middle;"></i> Network Error Occurred';
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
});
