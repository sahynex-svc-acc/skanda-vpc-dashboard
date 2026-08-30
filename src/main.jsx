import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { signInWithPopup, signOut } from 'firebase/auth';
import { firebaseAuth, googleProvider } from './firebase';
import './style.css';

const api = async (path, options = {}) => {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
};

const Icon = ({ name, size = 18 }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const d = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>,
    git: <path d="M9 19c-4 1-4-2-5-2m10 4v-3.9c0-1.1.1-1.5-.5-2.1 2-.2 4.1-1 4.1-4.6 0-1-.4-1.8-1-2.4.1-.3.4-1.2-.1-2.4 0 0-.8-.3-2.6 1a9 9 0 0 0-4.8 0c-1.8-1.2-2.6-1-2.6-1-.5 1.2-.2 2.1-.1 2.4-.6.6-1 1.4-1 2.4 0 3.6 2.1 4.4 4.1 4.6-.6.5-.6 1.1-.5 2.1V21"/>,
    activity: <path d="M3 12h4l2-7 4 14 2-7h6"/>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8 8 0 0 0 14.8 4L21 14"/><path d="M21 19v-5h-5"/></>,
    play: <path d="m8 5 11 7-11 7V5Z"/>,
    stop: <rect x="6" y="6" width="12" height="12" rx="1"/>,
    external: <><path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"/></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    close: <><path d="M6 6l12 12M18 6 6 18"/></>,
  };
  return <svg {...p}>{d[name] || d.grid}</svg>;
};

const transitional = new Set(['deploying', 'starting', 'stopping', 'restarting']);
const prettyStatus = status => status ? status.replace(/_/g, ' ') : 'Unknown';

function App() {
  const [me, setMe] = useState(null);
  const [apps, setApps] = useState([]);
  const [health, setHealth] = useState(null);
  const [view, setView] = useState('overview');
  const [selected, setSelected] = useState(null);
  const [deploy, setDeploy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actions, setActions] = useState({});
  const [toast, setToast] = useState('');

  const load = useCallback(async (silent = true) => {
    try {
      const [m, a, h] = await Promise.all([api('/me'), api('/apps'), api('/health')]);
      setMe(m.user);
      const nextApps = Array.isArray(a) ? a : (a.apps || []);
      setApps(nextApps);
      setHealth(h);
      setActions(prev => {
        const next = { ...prev };
        for (const app of nextApps) {
          const pending = next[app.app_id];
          if (!pending) continue;
          if ((pending.action === 'stop' || pending.action === 'restart') && app.status === 'stopped') delete next[app.app_id];
          if ((pending.action === 'start' || pending.action === 'restart') && app.status === 'running') delete next[app.app_id];
          if (app.status === 'failed') delete next[app.app_id];
        }
        return next;
      });
    } catch (e) {
      if (e.message === 'AUTH_REQUIRED') setMe(null);
      else if (!silent) setToast(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(), 2500);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const action = async (id, verb) => {
    setActions(prev => ({ ...prev, [id]: { action: verb, started: Date.now() } }));
    try {
      await api(`/apps/${id}/${verb}`, { method: 'POST' });
      setToast(`${verb[0].toUpperCase() + verb.slice(1)} requested`);
      await load(false);
    } catch (e) {
      setActions(prev => { const n = { ...prev }; delete n[id]; return n; });
      setToast(e.message);
    }
  };

  const manualRefresh = async () => { setRefreshing(true); await load(false); };
  const openApp = app => { setSelected(app); setView('application'); };

  if (loading) return <div className="splash"><div className="brandMark">S</div><span>Loading Skanda VPC</span></div>;
  if (!me) return <Login/>;

  const stats = {
    total: apps.length,
    running: apps.filter(a => a.status === 'running').length,
    stopped: apps.filter(a => a.status === 'stopped').length,
    transitional: apps.filter(a => transitional.has(a.status)).length,
  };
  const cpOnline = health?.status === 'healthy' || health?.status === 'ok';

  return <div className="appShell">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">S</div><div><strong>Skanda VPC</strong><small>Private cloud platform</small></div></div>
      <div className="navLabel">WORKSPACE</div>
      <nav>
        <Nav active={view === 'overview'} icon="grid" text="Overview" click={() => setView('overview')}/>
        <Nav active={view === 'deployments' || view === 'application'} icon="box" text="Deployments" click={() => setView('deployments')}/>
        <Nav active={view === 'repositories'} icon="git" text="Repositories" click={() => setView('repositories')}/>
        <Nav active={view === 'activity'} icon="activity" text="Activity" click={() => setView('activity')}/>
      </nav>
      <div className="sidebarBottom"><div className="statusLine"><span className={`dot ${cpOnline ? 'online' : 'offline'}`}/>{cpOnline ? 'Control plane online' : 'Control plane offline'}</div><div className="version">Skanda VPC · 1.1</div></div>
    </aside>

    <main className="content">
      <header className="topbar">
        <button className="mobileMenu"><Icon name="menu"/></button>
        <div className="crumb">Workspace <span>/</span> {view === 'application' ? 'Application' : view[0].toUpperCase() + view.slice(1)}</div>
        <div className="account">
          <img className="avatarImg" src={me.picture || ''} onError={e => { e.currentTarget.style.display = 'none'; }} />
          <div className="accountText"><b>{me.name}</b><small>{me.email}</small></div>
          <button className="secondary signOut" onClick={async () => { await api('/auth/logout', { method: 'POST' }); await signOut(firebaseAuth); location.reload(); }}>Sign out</button>
        </div>
      </header>

      {view === 'overview' && <Overview stats={stats} apps={apps} health={health} cpOnline={cpOnline} deploy={() => setDeploy(true)} open={openApp} action={action} actions={actions} refresh={manualRefresh} refreshing={refreshing}/>} 
      {view === 'deployments' && <Deployments apps={apps} deploy={() => setDeploy(true)} open={openApp} action={action} actions={actions}/>} 
      {view === 'repositories' && <Repositories deploy={() => setDeploy(true)}/>} 
      {view === 'activity' && <Activity apps={apps}/>} 
      {view === 'application' && selected && <Application app={apps.find(a => a.app_id === selected.app_id) || selected} back={() => setView('deployments')} action={action} actions={actions}/>} 
    </main>

    {deploy && <DeployModal close={() => setDeploy(false)} done={() => { setDeploy(false); load(false); setView('deployments'); }}/>} 
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

function Login() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const login = async () => { setBusy(true); setError(''); try { const result = await signInWithPopup(firebaseAuth, googleProvider); const idToken = await result.user.getIdToken(true); await api('/auth/firebase', { method: 'POST', body: JSON.stringify({ idToken }) }); location.reload(); } catch (e) { setError(e.message.includes('unauthorized') ? 'This Google account is not authorized.' : 'Sign-in failed. Please try again.'); } finally { setBusy(false); } };
  return <div className="login"><div className="loginCard"><div className="brandMark big">S</div><div className="eyebrow">SKANDA VPC</div><h1>Deploy with confidence.</h1><p>Private application deployments with GitHub, isolated runtimes, and a simple control plane.</p><button className="googleBtn" onClick={login} disabled={busy}><b>G</b>{busy ? 'Signing in…' : 'Continue with Google'}</button>{error && <div className="error">{error}</div>}<div className="loginSecurity"><Icon name="shield" size={15}/> Only authorized accounts can deploy</div></div><div className="loginFoot">Skanda VPC · Private infrastructure</div></div>;
}

function Nav({ active, icon, text, click }) { return <button className={`navItem ${active ? 'active' : ''}`} onClick={click}><Icon name={icon}/>{text}</button>; }
function Header({ title, sub, action, eyebrow = 'WORKSPACE' }) { return <div className="pageHeader"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{sub}</p></div>{action}</div>; }

function Overview({ stats, apps, health, cpOnline, deploy, open, action, actions, refresh, refreshing }) {
  return <><Header title="Overview" sub="Monitor your applications and deploy new workloads." action={<button className="primary" onClick={deploy}><Icon name="plus"/> New deployment</button>}/>
    <div className="stats">
      <Stat l="Applications" v={stats.total}/><Stat l="Running" v={stats.running} tone="green"/><Stat l="Stopped" v={stats.stopped}/><Stat l="Control plane" v={cpOnline ? 'Online' : 'Offline'} tone={cpOnline ? 'green' : 'red'} sub={cpOnline ? 'Healthy' : 'Unavailable'}/>
    </div>
    {stats.transitional > 0 && <div className="liveNotice"><span className="statusDot yellow"/><div><b>{stats.transitional} deployment{stats.transitional > 1 ? 's' : ''} updating</b><span>Status is refreshing automatically every 2.5 seconds.</span></div></div>}
    <section className="section"><div className="sectionHead"><div><h2>Applications</h2><p>Live deployment status across your workspace.</p></div><button className="refreshBtn" onClick={refresh} disabled={refreshing}><Icon name="refresh" size={14}/>{refreshing ? 'Refreshing' : 'Refresh'}</button></div><Table apps={apps.slice(0, 8)} open={open} action={action} actions={actions}/></section>
  </>;
}

function Stat({ l, v, tone, sub }) { return <div className="statCard"><span>{l}</span><strong>{v}</strong>{sub && <i className={`statSub ${tone}`}><span className="statusDot"/>{sub}</i>}</div>; }

function Deployments({ apps, deploy, open, action, actions }) { return <><Header title="Deployments" sub="Build, run and manage your applications." action={<button className="primary" onClick={deploy}><Icon name="plus"/> New deployment</button>}/><section className="section"><div className="sectionHead"><div><h2>All deployments</h2><p>Live status updates are automatic.</p></div><span className="livePill"><span className="statusDot green"/> Live</span></div><Table apps={apps} open={open} action={action} actions={actions}/></section></>; }

function Table({ apps, open, action, actions = {} }) {
  if (!apps.length) return <div className="empty"><div className="emptyIcon"><Icon name="box" size={22}/></div><h3>No deployments yet</h3><p>Deploy your first application to see it here.</p></div>;
  return <div className="table"><div className="tr th"><span>APPLICATION</span><span>STATUS</span><span>RUNTIME</span><span>PORT</span><span>ACTIONS</span></div>{apps.map(a => {
    const pending = actions[a.app_id];
    const status = pending ? pending.action === 'restart' ? 'restarting' : pending.action : a.status;
    const busy = !!pending;
    return <div className="tr" key={a.app_id}>
      <button className="appName" onClick={() => open(a)}><span className="appIcon"><Icon name="box" size={15}/></span><span><b>{a.app_id}</b><small>{a.framework || a.runtime || 'application'}</small></span></button>
      <Status status={status}/>
      <span className="mutedCell">{a.runtime || '—'}{a.framework ? ` · ${a.framework}` : ''}</span>
      <span className="mutedCell">{a.port || '—'}</span>
      <span className="rowActions">
        <button title={a.status === 'running' ? 'Stop' : 'Start'} disabled={busy} onClick={() => action(a.app_id, a.status === 'running' ? 'stop' : 'start')}>{a.status === 'running' ? <Icon name="stop" size={14}/> : <Icon name="play" size={14}/>}</button>
        <button title="Restart" disabled={busy} onClick={() => action(a.app_id, 'restart')}><Icon name="refresh" size={14}/></button>
        {a.public_id && <a className="openBtn" title="Open application" href={`/a/${a.public_id}`} target="_blank" rel="noreferrer"><Icon name="external" size={14}/></a>}
      </span>
    </div>;
  })}</div>;
}

function Status({ status }) {
  const normalized = status || 'unknown';
  const cls = transitional.has(normalized) ? `status-${normalized}` : `status-${normalized === 'running' ? 'running' : normalized === 'stopped' ? 'stopped' : normalized === 'failed' || normalized === 'error' ? 'failed' : 'unknown'}`;
  return <span className={`statusBadge ${cls}`}><span className="dot"/>{prettyStatus(normalized)}</span>;
}

function Repositories({ deploy }) { return <><Header title="Repositories" sub="Deploy applications from connected GitHub repositories." action={<button className="primary" onClick={deploy}><Icon name="plus"/> Deploy repository</button>}/><div className="repoCard"><div className="repoLogo"><Icon name="git" size={23}/></div><div className="repoMain"><h2>GitHub</h2><p>Repository source is handled by the Skanda VPC control plane.</p><span className="connected"><span className="statusDot green"/> Connected</span></div></div></>; }

function Activity({ apps }) { return <><Header title="Activity" sub="Recent application state across your workspace."/><div className="activityList">{apps.map(a => <div className="activityItem" key={a.app_id}><div className="activityIcon"><Icon name={a.status === 'running' ? 'play' : 'stop'} size={14}/></div><div><b>{a.app_id}</b><p>Application is {prettyStatus(a.status)} on port {a.port || '—'}.</p></div><span>{a.runtime || 'runtime'}</span></div>)}</div></>; }

function Application({ app, back, action, actions }) {
  const [logs, setLogs] = useState('');
  const getLogs = async () => { try { const d = await api(`/apps/${app.app_id}/logs?lines=200`); setLogs(d.lines || ''); } catch (e) { setLogs(e.message); } };
  useEffect(() => { getLogs(); }, [app.app_id]);
  const pending = actions[app.app_id];
  const status = pending ? (pending.action === 'restart' ? 'restarting' : pending.action) : app.status;
  return <><button className="back" onClick={back}>← Back to deployments</button><div className="appHero"><div className="appTitle"><span className="appIcon large"><Icon name="box" size={20}/></span><div><div className="eyebrow">APPLICATION</div><h1>{app.app_id}</h1><div className="heroMeta"><Status status={status}/><span>{app.runtime || '—'}</span><span>{app.framework || '—'}</span><span>Port {app.port || '—'}</span></div></div></div><div className="heroActions"><button className="secondary" disabled={!!pending} onClick={() => action(app.app_id, app.status === 'running' ? 'stop' : 'start')}>{app.status === 'running' ? 'Stop' : 'Start'}</button><button className="primary" disabled={!!pending} onClick={() => action(app.app_id, 'restart')}>{pending ? 'Restarting…' : 'Restart'}</button>{app.public_id && <a className="secondary" href={`/a/${app.public_id}`} target="_blank" rel="noreferrer">Open app <Icon name="external" size={13}/></a>}</div></div><div className="logCard"><div className="sectionHead"><div><h2>Deployment logs</h2><p>Latest output from the application.</p></div><button className="secondary" onClick={getLogs}>Refresh</button></div><pre>{logs || 'No logs available.'}</pre></div></>;
}

function DeployModal({ close, done }) {
  const [repo, setRepo] = useState(''), [dir, setDir] = useState(''), [vars, setVars] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async e => { e.preventDefault(); setBusy(true); setError(''); const env = {}; vars.split('\n').forEach(x => { const i = x.indexOf('='); if (i > 0) env[x.slice(0, i).trim()] = x.slice(i + 1); }); try { await api('/deploy', { method: 'POST', body: JSON.stringify({ repo_id: repo.trim(), project_dir: dir.trim() || '.', env }) }); done(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="modalBackdrop"><form className="modal" onSubmit={submit}><div className="modalHead"><div><div className="eyebrow">NEW DEPLOYMENT</div><h2>Deploy application</h2><p>Configure the workload and start a new isolated deployment.</p></div><button className="close" type="button" onClick={close}><Icon name="close" size={18}/></button></div><label>GitHub repository ID</label><input required value={repo} onChange={e => setRepo(e.target.value)} placeholder="e.g. a6783370aae66a50"/><label>Project directory <span>optional</span></label><input value={dir} onChange={e => setDir(e.target.value)} placeholder="frontend"/><label>Environment variables <span>optional</span></label><textarea value={vars} onChange={e => setVars(e.target.value)} placeholder={'NODE_ENV=production\nAPI_URL=https://example.com'}/>{error && <div className="error">{error}</div>}<div className="modalFoot"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Deploying…' : 'Deploy application'}</button></div></form></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
