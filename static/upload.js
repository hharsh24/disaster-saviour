document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('upload-form');
    const resultDiv = document.getElementById('result-message');

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(uploadForm);
        
        const btn = uploadForm.querySelector('button');
        const originalText = btn.textContent;
        btn.textContent = 'Processing Image...';
        btn.disabled = true;
        resultDiv.textContent = ''; // clear old messages

        try {
            const res = await fetch('/api/detect', {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            
            if (res.ok) {
                resultDiv.style.color = 'var(--success)';
                resultDiv.innerHTML = `
                    Detected: ${data.results.severity_label}<br>
                    Victims: ${data.results.victim_count}<br>
                    Priority Score: ${data.results.priority_score}<br>
                    <span style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem; display: block;">Zone registered successfully!</span>
                `;
                uploadForm.reset();
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
