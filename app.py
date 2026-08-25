import os
from pathlib import Path
from urllib.parse import urlencode

import httpx
from authlib.integrations.starlette_client import OAuth
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import RedirectResponse, FileResponse, JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.staticfiles import StaticFiles

load_dotenv()

BASE = Path(__file__).parent
CONTROL_PLANE = os.getenv('CONTROL_PLANE_URL', 'http://127.0.0.1:32000').rstrip('/')
DEPLOY_TOKEN = os.getenv('SKANDA_DEPLOY_TOKEN', '')
ALLOWED = {x.strip().lower() for x in os.getenv('ALLOWED_GOOGLE_EMAILS', '').split(',') if x.strip()}
SESSION_SECRET = os.getenv('SESSION_SECRET', '')

app = FastAPI(title='Skanda VPC Dashboard')
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET or 'CHANGE_ME', same_site='lax', https_only=os.getenv('COOKIE_SECURE','true').lower() == 'true', max_age=60*60*24*7)

oauth = OAuth()
oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'},
)

async def current_user(request: Request):
    user = request.session.get('user')
    if not user:
        raise HTTPException(401, 'Authentication required')
    if ALLOWED and user.get('email','').lower() not in ALLOWED:
        request.session.clear()
        raise HTTPException(403, 'Your Google account is not authorized for this VPC')
    return user

async def cp(method: str, path: str, *, json=None, params=None, deploy=False):
    headers = {}
    if DEPLOY_TOKEN:
        headers['X-Skanda-Deploy-Token'] = DEPLOY_TOKEN
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.request(method, CONTROL_PLANE + path, json=json, params=params, headers=headers)
    try: data = r.json()
    except Exception: data = {'detail': r.text or 'Control plane error'}
    if r.status_code >= 400:
        raise HTTPException(r.status_code, data.get('detail', 'Control plane request failed') if isinstance(data, dict) else 'Control plane request failed')
    return data

@app.get('/api/me')
async def me(request: Request):
    user = await current_user(request)
    return {'user': user}

@app.get('/api/auth/google')
async def google_login(request: Request):
    redirect_uri = request.url_for('google_callback')
    return await oauth.google.authorize_redirect(request, redirect_uri)

@app.get('/api/auth/google/callback')
async def google_callback(request: Request):
    try:
        token = await oauth.google.authorize_access_token(request)
        user = token.get('userinfo')
        if not user:
            user = await oauth.google.parse_id_token(request, token)
        email = (user.get('email') or '').lower()
        if not email or (ALLOWED and email not in ALLOWED):
            request.session.clear()
            return RedirectResponse('/?error=unauthorized')
        request.session['user'] = {
            'sub': user.get('sub'), 'email': email,
            'name': user.get('name') or email.split('@')[0],
            'picture': user.get('picture'),
        }
        return RedirectResponse('/')
    except Exception:
        return RedirectResponse('/?error=google_auth_failed')

@app.post('/api/auth/logout')
async def logout(request: Request):
    request.session.clear()
    return {'ok': True}

@app.get('/api/health')
async def health(request: Request):
    await current_user(request)
    try: return await cp('GET', '/api/health')
    except Exception as e: return {'status': 'unavailable', 'detail': str(e)}

@app.get('/api/apps')
async def apps(request: Request):
    await current_user(request)
    return await cp('GET', '/api/apps')

@app.post('/api/deploy')
async def deploy(request: Request):
    await current_user(request)
    payload = await request.json()
    return await cp('POST', '/api/deploy', json=payload, deploy=True)

@app.post('/api/apps/{app_id}/stop')
async def stop(app_id: str, request: Request):
    await current_user(request)
    return await cp('POST', f'/api/apps/{app_id}/stop')

@app.post('/api/apps/{app_id}/restart')
async def restart(app_id: str, request: Request):
    await current_user(request)
    return await cp('POST', f'/api/apps/{app_id}/restart')

@app.post('/api/apps/{app_id}/start')
async def start(app_id: str, request: Request):
    await current_user(request)
    # The current control plane exposes restart; use it as the start operation for stopped apps.
    return await cp('POST', f'/api/apps/{app_id}/restart')

@app.get('/api/apps/{app_id}/logs')
async def logs(app_id: str, request: Request, lines: int = 150):
    await current_user(request)
    return await cp('GET', f'/api/apps/{app_id}/logs', params={'lines': lines})

@app.get('/api/apps/{app_id}')
async def app_detail(app_id: str, request: Request):
    await current_user(request)
    return await cp('GET', f'/api/apps/{app_id}')

app.mount('/assets', StaticFiles(directory=BASE / 'dist/assets'), name='assets')

@app.get('/{path:path}')
async def frontend(path: str):
    file = BASE / 'dist' / path
    if file.is_file(): return FileResponse(file)
    return FileResponse(BASE / 'dist/index.html')
