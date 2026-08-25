import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const api = async (path, options = {}) => {
  const res = await fetch(`/api${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
};

const Icon = ({ name, size = 18 }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>,
    git: <><path d="M9 19c-4 1-4-2-5-2m10 4v-3.9c0-1.1.1-1.5-.5-2.1 2-.2 4.1-1 4.1-4.6 0-1-.4-1.8-1-2.4.1-.3.4-1.2-.1-2.4 0 0-.8-.3-2.6 1a9 9 0 0 0-4.8 0c-1.8-1.2-2.6-1-2.6-1-.5 1.2-.2 2.1-.1 2.4-.6.6-1 1.4-1 2.4 0 3.6 2.1 4.4 4.1 4.6-.6.5-.6 1.1-.5 2.1V21"/></>,
    activity: <><path d="M3 12h4l2-7 4 14 2-7h6"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8 8 0 0 0 14.8 4L21 14"/><path d="M21 19v-5h-5"/></>,
    play: <path d="m8 5 11 7-11 7V5Z"/>,
    stop: <rect x="6" y="6" width="12" height="12" rx="1"/>,
    external: <><path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"/></>,
    terminal: <><path d="m4 5 6 6-6 6"/><path d="M12 17h8"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    shield: <><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  };
  return <svg {...p}>{paths[name] || paths.grid}</svg>;
};

function App() {
  const [me, setMe] = useState(null);
  const [apps, setApps] = useState([]);
  const [health, setHealth] = useState(null);
  const [view, setView] = useState('overview');
  const [selected, setSelected] = useState(null);
  const [showDeploy, setShowDeploy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  const load = async () => {
    try {
      const [m, a, h] = await Promise.all([api('/me'), api('/apps'), api('/health')]);
      setMe(m.user); setApps(a.apps || []); setHealth(h);
    } catch (e) {
      if (e.message === 'AUTH_REQUIRED') setMe(null); else setToast(e.message);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);

  const stats = useMemo(() => ({
    total: apps.length,
    running: apps.filter(a => a.status === 'running').length,
    stopped: apps.filter(a => a.status === 'stopped').length,
  }), [apps]);

  const action = async (id, verb) => {
    try { await api(`/apps/${id}/${verb}`, { method: 'POST' }); setToast(`${verb[0].toUpperCase()+verb.slice(1)} completed`); await load(); }
    catch (e) { setToast(e.message); }
  };

  const openApp = (app) => { setSelected(app); setView('application'); };

  if (loading) return <div className="splash"><div className="brandMark">S</div><span>Loading Skanda VPC…</span></div>;
  if (!me) return <Login />;

  return <div className="appShell">
    <aside className={`sidebar ${mobileNav ? 'mobileOpen' : ''}`}>
      <div className="brand"><div className="brandMark">S</div><div><strong>Skanda VPC</strong><small>Private cloud platform</small></div></div>
      <div className="navLabel">WORKSPACE</div>
      <nav>
        <Nav active={view==='overview'} icon="grid" text="Overview" onClick={()=>{setView('overview');setMobileNav(false)}}/>
        <Nav active={view==='deployments'} icon="box" text="Deployments" onClick={()=>{setView('deployments');setMobileNav(false)}}/>
        <Nav active={view==='repositories'} icon="git" text="Repositories" onClick={()=>{setView('repositories');setMobileNav(false)}}/>
        <Nav active={view==='activity'} icon="activity" text="Activity" onClick={()=>{setView('activity');setMobileNav(false)}}/>
      </nav>
      <div className="sidebarBottom"><div className="statusLine"><span className="dot"/> Control plane online</div><div className="version">Skanda VPC · 1.0</div></div>
    </aside>
    <main className="content">
      <header className="topbar"><button className="mobileMenu" onClick={()=>setMobileNav(!mobileNav)}><Icon name="menu"/></button><div className="crumb">Workspace <span>/</span> {view === 'application' ? 'Application' : view[0].toUpperCase()+view.slice(1)}</div><div className="topActions"><button className="iconBtn" onClick={load} title="Refresh"><Icon name="refresh"/></button><div className="account"><div className="avatar">{(me.name || me.email || 'U')[0].toUpperCase()}</div><div className="accountText"><b>{me.name || 'User'}</b><small>{me.email}</small></div><button className="chevron" onClick={()=>api('/auth/logout',{method:'POST'}).then(()=>location.reload())}><Icon name="chevron" size={15}/></button></div></div></header>
      {view==='overview' && <Overview stats={stats} apps={apps} health={health} onDeploy={()=>setShowDeploy(true)} onOpen={openApp} onAction={action}/>} 
      {view==='deployments' && <Deployments apps={apps} onDeploy={()=>setShowDeploy(true)} onOpen={openApp} onAction={action}/>} 
      {view==='repositories' && <Repositories onDeploy={()=>setShowDeploy(true)}/>} 
      {view==='activity' && <Activity apps={apps}/>} 
      {view==='application' && selected && <Application app={selected} onBack={()=>setView('deployments')} onAction={action}/>} 
    </main>
    {showDeploy && <DeployModal onClose={()=>setShowDeploy(false)} onDone={()=>{setShowDeploy(false);load();setView('deployments')}}/>}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

function Login(){ return <div className="login"><div className="loginCard"><div className="brandMark big">S</div><div className="eyebrow">SKANDA VPC</div><h1>Deploy with confidence.</h1><p>Private application deployments with GitHub, isolated runtimes, and a simple control plane.</p><a className="googleBtn" href="/api/auth/google"><span className="googleG">G</span> Continue with Google</a><div className="loginSecurity"><Icon name="shield" size={15}/> Only authorized accounts can deploy</div></div><div className="loginFoot">Skanda VPC · Private infrastructure</div></div> }
function Nav({active,icon,text,onClick}){return <button className={`navItem ${active?'active':''}`} onClick={onClick}><Icon name={icon}/><span>{text}</span></button>}
function Header({eyebrow,title,sub,action}){return <div className="pageHeader"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{sub}</p></div>{action}</div>}
function Overview({stats,apps,health,onDeploy,onOpen,onAction}){return <><Header eyebrow="WORKSPACE" title="Overview" sub="Monitor your applications and deploy new workloads." action={<button className="primary" onClick={onDeploy}><Icon name="plus" size={17}/> New deployment</button>}/><div className="stats"><Stat label="Applications" value={stats.total}/><Stat label="Running" value={stats.running} good/><Stat label="Stopped" value={stats.stopped}/><Stat label="Control plane" value={health?.status==='ok'?'Healthy':'Unknown'} good={health?.status==='ok'}/></div><section className="section"><div className="sectionHead"><div><h2>Applications</h2><p>Your latest deployments.</p></div><button className="linkBtn" onClick={()=>{}}>View all</button></div><AppTable apps={apps.slice(0,6)} onOpen={onOpen} onAction={onAction}/></section></>}
function Stat({label,value,good}){return <div className="statCard"><span>{label}</span><strong>{value}</strong>{good&&<i className="healthy"><span className="dot"/> Online</i>}</div>}
function Deployments({apps,onDeploy,onOpen,onAction}){return <><Header eyebrow="WORKSPACE" title="Deployments" sub="Build, run and manage your applications." action={<button className="primary" onClick={onDeploy}><Icon name="plus" size={17}/> New deployment</button>}/><section className="section"><AppTable apps={apps} onOpen={onOpen} onAction={onAction}/></section></>}
function AppTable({apps,onOpen,onAction}){if(!apps.length)return <div className="empty"><div className="emptyIcon"><Icon name="box" size={22}/></div><h3>No deployments yet</h3><p>Deploy your first application to see it here.</p></div>;return <div className="table"><div className="tr th"><span>APPLICATION</span><span>STATUS</span><span>RUNTIME</span><span>PORT</span><span>UPDATED</span><span/></div>{apps.map(a=><div className="tr" key={a.app_id}><button className="appName" onClick={()=>onOpen(a)}><span className="appIcon"><Icon name="box" size={15}/></span><span><b>{a.app_id}</b><small>{a.framework||a.runtime||'application'}</small></span></button><span><Status status={a.status}/></span><span className="mutedCell">{a.runtime || '—'}{a.framework?` · ${a.framework}`:''}</span><span className="mutedCell">{a.port || '—'}</span><span className="mutedCell">{a.status === 'running'?'Running':'Stopped'}</span><span className="rowActions">{a.status==='running'?<button title="Stop" onClick={()=>onAction(a.app_id,'stop')}><Icon name="stop" size={15}/></button>:<button title="Start" onClick={()=>onAction(a.app_id,'start')}><Icon name="play" size={15}/></button>}<button title="Restart" onClick={()=>onAction(a.app_id,'restart')}><Icon name="refresh" size={15}/></button></span></div>)}</div>}
function Status({status}){return <span className={`statusBadge ${status==='running'?'running':'stopped'}`}><span className="dot"/>{status||'unknown'}</span>}
function Repositories({onDeploy}){return <><Header eyebrow="SOURCE" title="Repositories" sub="Connect a GitHub repository to create a deployment." action={<button className="primary" onClick={onDeploy}><Icon name="plus" size={17}/> Deploy repository</button>}/><div className="repoCard"><div className="repoLogo"><Icon name="git" size={25}/></div><div className="repoMain"><h2>GitHub</h2><p>Repositories are deployed through the Skanda VPC control plane.</p><span className="connected"><span className="dot"/> Connected</span></div><div className="repoAction"><button className="secondary" onClick={onDeploy}>Create deployment</button></div></div><div className="infoPanel"><Icon name="shield"/><div><b>Private by default</b><p>Repository access is handled by the control plane. No GitHub credentials are stored in the browser.</p></div></div></>}
function Activity({apps}){return <><Header eyebrow="WORKSPACE" title="Activity" sub="Recent application state across your workspace."/><div className="activityList">{apps.map(a=><div className="activityItem" key={a.app_id}><div className="activityIcon"><Icon name={a.status==='running'?'play':'stop'} size={15}/></div><div><b>{a.app_id}</b><p>Application is {a.status} on port {a.port || '—'}.</p></div><span>{a.runtime || 'runtime'}</span></div>)}{!apps.length&&<div className="empty"><h3>No activity</h3><p>Deploy an application to start seeing events.</p></div>}</div></>}
function Application({app,onBack,onAction}){const[logs,setLogs]=useState('');const[loading,setLoading]=useState(false);const getLogs=async()=>{setLoading(true);try{const d=await api(`/apps/${app.app_id}/logs?lines=150`);setLogs(d.lines||'')}catch(e){setLogs(e.message)}finally{setLoading(false)}};useEffect(()=>{getLogs()},[app.app_id]);return <><button className="back" onClick={onBack}>← Back to deployments</button><div className="appHero"><div><div className="appTitle"><span className="appIcon large"><Icon name="box" size={20}/></span><div><div className="eyebrow">APPLICATION</div><h1>{app.app_id}</h1></div></div><div className="heroMeta"><Status status={app.status}/><span>{app.runtime}</span><span>{app.framework}</span><span>Port {app.port}</span></div></div><div className="heroActions">{app.status==='running'?<button className="secondary" onClick={()=>onAction(app.app_id,'stop')}><Icon name="stop" size={15}/> Stop</button>:<button className="secondary" onClick={()=>onAction(app.app_id,'start')}><Icon name="play" size={15}/> Start</button>}<button className="secondary" onClick={()=>onAction(app.app_id,'restart')}><Icon name="refresh" size={15}/> Restart</button>{app.public_id&&<a className="primary" target="_blank" href={`/a/${app.public_id}`}><Icon name="external" size={15}/> Open app</a>}</div></div><div className="detailGrid"><div className="section logs"><div className="sectionHead"><div><h2>Deployment logs</h2><p>Latest output from the application.</p></div><button className="iconBtn" onClick={getLogs}><Icon name="refresh" size={16}/></button></div><pre>{loading?'Loading logs…':logs||'No logs available.'}</pre></div><div className="section details"><h2>Configuration</h2><Detail label="Public ID" value={app.public_id||'—'}/><Detail label="Project" value={app.project_dir||'—'}/><Detail label="Runtime" value={app.runtime||'—'}/><Detail label="Framework" value={app.framework||'—'}/><Detail label="Port" value={app.port||'—'}/><Detail label="Process" value={app.pid||'—'}/></div></div></>}
function Detail({label,value}){return <div className="detail"><span>{label}</span><b>{value}</b></div>}
function DeployModal({onClose,onDone}){const[repo,setRepo]=useState('');const[dir,setDir]=useState('');const[env,setEnv]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const submit=async e=>{e.preventDefault();setBusy(true);setError('');let vars={};env.split('\n').map(x=>x.trim()).filter(Boolean).forEach(line=>{const i=line.indexOf('=');if(i>0)vars[line.slice(0,i).trim()]=line.slice(i+1)});try{await api('/deploy',{method:'POST',body:JSON.stringify({repo_id:repo,project_dir:dir,env:vars})});onDone()}catch(e){setError(e.message);setBusy(false)}};return <div className="modalBackdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal" onSubmit={submit}><div className="modalHead"><div><div className="eyebrow">NEW DEPLOYMENT</div><h2>Deploy application</h2><p>Build and publish a project through the control plane.</p></div><button type="button" className="close" onClick={onClose}>×</button></div><label>Repository ID <span>Required</span></label><input autoFocus value={repo} onChange={e=>setRepo(e.target.value)} placeholder="a6783370aae66a50" required/><small className="hint">Use the repository ID returned by the control plane.</small><label>Project directory <span>Optional</span></label><input value={dir} onChange={e=>setDir(e.target.value)} placeholder="frontend"/><label>Environment variables <span>Optional</span></label><textarea value={env} onChange={e=>setEnv(e.target.value)} placeholder={'NODE_ENV=production\nAPI_URL=https://example.com'}/>{error&&<div className="error">{error}</div>}<div className="modalFoot"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Deploying…':'Deploy application'} {!busy&&'→'}</button></div></form></div>}

createRoot(document.getElementById('root')).render(<App/>);
