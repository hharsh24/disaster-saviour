import requests
from PIL import Image
import io
import sys
import time
import subprocess

server = subprocess.Popen(["python", "main.py"])
time.sleep(5) # wait for server to start

try:
    BASE_URL = "http://localhost:8000"
    
    # 1. Signup / Login
    session = requests.Session()
    test_user = "testuser_ultra"
    test_pass = "password123"
    r_signup = session.post(f"{BASE_URL}/api/signup", json={"username": test_user, "password": test_pass})
    r_login = session.post(f"{BASE_URL}/api/login", json={"username": test_user, "password": test_pass})

    # Create dummy image
    img = Image.new('RGB', (10, 10), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr = img_byte_arr.getvalue()
    
    files = {'file': ('dummy.jpg', img_byte_arr, 'image/jpeg')}
    data = {'lat': 28.6, 'long': 77.2}
    r_detect = session.post(f"{BASE_URL}/api/detect", files=files, data=data)
    print(f"Detect API: {r_detect.status_code}")
    print(r_detect.json())
finally:
    server.terminate()
