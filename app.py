import os
from pathlib import Path

import firebase_admin
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from firebase_admin import auth, credentials
from starlette.middleware.sessions import SessionMiddleware
from starlette.staticfiles import StaticFiles

load_dotenv()

BASE = Path(__file__).parent
CONTROL_PLANE = os.getenv('CONTROL_PLANE_URL', 'http://127.0.0.1:30000').rstrip('/')
DEPLOY_TOKEN = os.getenv('SKANDA_DEPLOY_TOKEN', '')
ALLOWED = {x.strip().lower() for x in os.getenv('ALLOWED_GOOGLE_EMAILS', '').split(',') if x.strip()}
SESSION_SECRET = os.getenv('SESSION_SECRET', '')
COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'true').lower() == 'true'

if not firebase_admin._apps:
    cred_path = os.getenv('FIREBASE_SERVICE_ACCOUNT')
    if cred_path:
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    else:
        firebase_admin.initialize_app()

app = FastAPI(title='Skanda VPC Dashboard')
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET or 'CHANGE_ME', same_site='lax', https_only=COOKIE_SECURE, max_age=60*60*24*7)


def authorized(email: str) -> bool:
    return not ALLOWED or email.lower() in ALLOWED


async def current_user(request: Request):
    user = request.session.get('user')
    print(
        f"AUTH DEBUG path={request.url.path} "
        f"cookie={'YES' if request.headers.get('cookie') else 'NO'} "
        f"session_user={'YES' if user else 'NO'}",
        flush=True
    )
    if not user:
        raise HTTPException(401, 'Authentication required')
    if not authorized(user.get('email', '')):
        request.session.clear()
        raise HTTPException(403, 'Your Google account is not authorized for this VPC')
    return user


async def cp(method: str, path: str, *, json=None, params=None, owner_uid=None):
    headers = {}

    if DEPLOY_TOKEN:
        headers['X-Skanda-Deploy-Token'] = DEPLOY_TOKEN

    if owner_uid:
        headers['X-Skanda-User-UID'] = owner_uid

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.request(
            method,
            CONTROL_PLANE + path,
            json=json,
            params=params,
            headers=headers
        )

    try:
        data = response.json()
    except Exception:
        data = {'detail': response.text or 'Control plane error'}

    if response.status_code >= 400:
        print(
            f"CP DEBUG method={method} path={path} "
            f"url={CONTROL_PLANE + path} "
            f"status={response.status_code} "
            f"owner_uid={'SET' if owner_uid else 'EMPTY'} "
            f"deploy_token={'SET' if DEPLOY_TOKEN else 'EMPTY'} "
            f"detail={data.get('detail', 'Control plane error')}",
            flush=True
        )
        raise HTTPException(
            response.status_code,
            data.get('detail', 'Control plane error')
        )

    return data

@app.get('/api/me')
async def me(request: Request):
    return {'user': await current_user(request)}


@app.post('/api/auth/firebase')
async def firebase_login(request: Request):
    body = await request.json()
    token = body.get('idToken')
    if not token:
        raise HTTPException(400, 'Firebase ID token is required')
    try:
        decoded = auth.verify_id_token(
            token,
            check_revoked=True,
            clock_skew_seconds=10,
        )
    except Exception:
        raise HTTPException(401, 'Invalid or expired Firebase ID token')
    email = (decoded.get('email') or '').lower()
    if not email or not authorized(email):
        raise HTTPException(403, 'Your Google account is not authorized for this VPC')
    request.session['user'] = {
        'uid': decoded.get('uid'),
        'email': email,
        'name': decoded.get('name') or email.split('@')[0],
        'picture': decoded.get('picture'),
        'provider': 'firebase-google',
    }
    return {'user': request.session['user']}


@app.post('/api/auth/logout')
async def logout(request: Request):
    request.session.clear()
    return {'ok': True}


@app.get('/api/health')
async def health(request: Request):
    await current_user(request)
    try:
        return await cp('GET', '/api/health')
    except Exception as exc:
        return {'status': 'unavailable', 'detail': str(exc)}


@app.get('/api/apps')
async def apps(request: Request):
    user = await current_user(request)
    return await cp('GET', '/api/apps', owner_uid=user['uid'])


@app.post('/api/deploy')
async def deploy(request: Request):
    user = await current_user(request)
    body = await request.json()
    body['owner_uid'] = user['uid']
    return await cp(
        'POST',
        '/api/deploy',
        json=body,
        owner_uid=user['uid']
    )


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
    return await cp('POST', f'/api/apps/{app_id}/restart')


@app.get('/api/apps/{app_id}/logs')
async def logs(app_id: str, request: Request, lines: int = 150):
    await current_user(request)
    return await cp('GET', f'/api/apps/{app_id}/logs', params={'lines': lines})


@app.get('/api/apps/{app_id}')
async def app_detail(app_id: str, request: Request):
    await current_user(request)
    return await cp('GET', f'/api/apps/{app_id}')


assets = BASE / 'dist/assets'
if assets.exists():
    app.mount('/assets', StaticFiles(directory=assets), name='assets')


@app.get('/{path:path}')
async def frontend(path: str):
    file = BASE / 'dist' / path
    if file.is_file():
        return FileResponse(file)
    return FileResponse(BASE / 'dist/index.html')
