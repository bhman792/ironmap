import os, hashlib, requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

email    = os.getenv('RENPHO_EMAIL')
password = os.getenv('RENPHO_PASSWORD')
md5pw    = hashlib.md5(password.encode()).hexdigest()

print(f"Email:       {email}")
print(f"Password:    {password}")
print(f"MD5:         {md5pw}")

session = requests.Session()
session.headers.update({
    'User-Agent':   'Renpho/2.1.0 (iPhone; iOS 14.0; Scale/2.0)',
    'Content-Type': 'application/json',
})

# Try MD5 password (original method)
print("\n--- Trying MD5 password ---")
res = session.post(
    'https://renpho.qnclouds.com/api/v3/users/sign_in.json',
    json={ 'app_id': 'Renpho', 'terminal_user_session_key': 'renpho_app',
           'email': email, 'password': md5pw },
    timeout=15
)
print(f"Status: {res.status_code}")
print(f"Body:   {res.text[:500]}")

# Try plain password
print("\n--- Trying plain password ---")
res2 = session.post(
    'https://renpho.qnclouds.com/api/v3/users/sign_in.json',
    json={ 'app_id': 'Renpho', 'terminal_user_session_key': 'renpho_app',
           'email': email, 'password': password },
    timeout=15
)
print(f"Status: {res2.status_code}")
print(f"Body:   {res2.text[:500]}")
