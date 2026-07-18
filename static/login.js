document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const signupBtn = document.getElementById('signup-btn');

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
                successDiv.textContent = '';
            }
        } catch (err) {
            errorDiv.textContent = 'Network error occurred';
            successDiv.textContent = '';
        }
    });

    if (signupBtn) {
        signupBtn.addEventListener('click', async () => {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            if (!username || !password) {
                errorDiv.textContent = 'Enter username and password to sign up';
                successDiv.textContent = '';
                return;
            }

            try {
                const res = await fetch('/api/signup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await res.json();
                if (res.ok) {
                    successDiv.textContent = data.message;
                    errorDiv.textContent = '';
                } else {
                    errorDiv.textContent = data.detail || 'Signup failed';
                    successDiv.textContent = '';
                }
            } catch (err) {
                errorDiv.textContent = 'Network error occurred';
                successDiv.textContent = '';
            }
        });
    }
});
