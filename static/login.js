document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorDiv = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            if (res.ok) {
                window.location.href = '/dashboard';
            } else {
                const data = await res.json();
                errorDiv.textContent = data.detail || 'Login failed';
            }
        } catch (err) {
            errorDiv.textContent = 'Network error occurred';
        }
    });
});
