import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowRight, BadgeCheck, FileCheck2, FileText, Fingerprint,
  Hospital, KeyRound, LockKeyhole, LogOut, Plus, ScanSearch, Shield, ShieldCheck,
  Users, UploadCloud, AlertTriangle, CheckCircle2, Eye, EyeOff, RefreshCw,
  ArrowLeft, Search, Download, Trash2, Clock, UserCog, Power, FileDown, FilePlus2,
} from 'lucide-react'
import { api } from './api'
import { createPatientKeyPair, decryptAndVerifyReport, downloadKeyFile, unlockPatientKeyFile } from './crypto'
import Landing from './Landing'
import './styles.css'

const IDLE_LIMIT_MS = 10 * 60 * 1000
const IDLE_WARNING_MS = 60 * 1000

// Signs the user out after a period of no interaction; warns for the final minute.
function useIdleLogout(enabled, onLogout) {
  const last = React.useRef(Date.now())
  const [secondsLeft, setSecondsLeft] = useState(null)
  useEffect(() => {
    if (!enabled) { setSecondsLeft(null); return }
    last.current = Date.now()
    const touch = () => { last.current = Date.now() }
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }))
    const timer = setInterval(() => {
      const idle = Date.now() - last.current
      if (idle >= IDLE_LIMIT_MS) { setSecondsLeft(null); onLogout(); return }
      setSecondsLeft(idle >= IDLE_LIMIT_MS - IDLE_WARNING_MS ? Math.ceil((IDLE_LIMIT_MS - idle) / 1000) : null)
    }, 1000)
    return () => { events.forEach((name) => window.removeEventListener(name, touch)); clearInterval(timer) }
  }, [enabled])
  return { secondsLeft, stay: () => { last.current = Date.now(); setSecondsLeft(null) } }
}

// Public pages (landing / sign in / register), kept in the URL hash so the browser back button works.
function usePublicView() {
  const read = () => (window.location.hash === '#signin' ? 'signin' : window.location.hash === '#register' ? 'register' : 'home')
  const [view, setView] = useState(read)
  useEffect(() => {
    const sync = () => setView(read())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  const go = (next) => {
    window.history.pushState(null, '', next === 'home' ? window.location.pathname : `#${next}`)
    setView(next)
    window.scrollTo(0, 0)
  }
  return [view, go]
}

function App() {
  const [session, setSession] = useState(null)
  const logout = () => setSession(null)
  const idle = useIdleLogout(Boolean(session), logout)
  const [view, go] = usePublicView()
  if (!session) {
    if (view === 'home') return <Landing onSignIn={() => go('signin')} onRegister={() => go('register')} />
    return <AuthScreen key={view} initialMode={view === 'register' ? 'register' : 'login'} onAuth={setSession} onBack={() => go('home')} />
  }

  return <>
    <Dashboard session={session} onLogout={logout} />
    {idle.secondsLeft !== null && <div className="idle-banner" role="alert"><Clock size={18} /><div><strong>Still there?</strong><span>For your security you will be signed out in {idle.secondsLeft}s.</span></div><button className="btn btn-primary btn-small" onClick={idle.stay}>Stay signed in</button></div>}
  </>
}

function AuthScreen({ onAuth, initialMode = 'login', onBack }) {
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({ name: '', email: '', password: '', patient_code: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [otp, setOtp] = useState('')

  const change = (e) => setForm((old) => ({ ...old, [e.target.name]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST', body: JSON.stringify(mode === 'login' && mfaRequired ? { ...form, otp } : form),
      })
      if (result.mfa_required) { setMfaRequired(true); return }
      onAuth({ token: result.access_token, user: result.user })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <div className="brand brand-light"><span className="brand-mark"><ShieldCheck size={21} /></span><span>SecureLab</span></div>
        <div className="auth-copy">
          <div className="eyebrow eyebrow-light"><span className="pulse-dot" /> SECURE HEALTHCARE DOCUMENTS</div>
          <h1>Your health data.<br /><em>Under your control.</em></h1>
          <p>Private laboratory reports protected with hybrid encryption and verifiable digital signatures.</p>
          <div className="security-points">
            <div><LockKeyhole size={17} /><span>AES-256-GCM report encryption</span></div>
            <div><KeyRound size={17} /><span>Patient-controlled RSA private keys</span></div>
            <div><BadgeCheck size={17} /><span>Hospital digital-signature verification</span></div>
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          {onBack && <button type="button" className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to home</button>}
          <div className="mobile-brand brand"><span className="brand-mark"><ShieldCheck size={21} /></span><span>SecureLab</span></div>
          <div className="auth-heading">
            <div className="eyebrow">{mfaRequired ? 'TWO-FACTOR AUTHENTICATION' : mode === 'login' ? 'WELCOME BACK' : 'PATIENT REGISTRATION'}</div>
            <h2>{mfaRequired ? 'Verify your sign-in' : mode === 'login' ? 'Sign in to your portal' : 'Create your patient account'}</h2>
            <p>{mfaRequired ? 'Enter the current six-digit code from your authenticator app.' : mode === 'login' ? 'Access your securely protected laboratory reports.' : 'Register to receive encrypted laboratory reports.'}</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            {mode === 'register' && <Field label="Full name" name="name" value={form.name} onChange={change} placeholder="Enter your full name" required />}
            <Field label="Email address" name="email" type="email" value={form.email} onChange={change} placeholder="you@example.com" required />
            {mode === 'register' && <Field label="Patient ID (optional)" name="patient_code" value={form.patient_code} onChange={change} placeholder="Leave blank to generate one" />}
            <PasswordField label="Password" name="password" value={form.password} onChange={change} placeholder={mode === 'register' ? 'At least 10 characters' : 'Enter your password'} required />
            {mfaRequired && <Field label="Authenticator code" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="000000" required />}
            {error && <div className="alert alert-error"><AlertTriangle size={16} />{error}</div>}
            <button className="btn btn-primary btn-full" disabled={busy || (mfaRequired && otp.length !== 6)}>{busy ? 'Please wait…' : mfaRequired ? 'Verify & sign in' : mode === 'login' ? 'Sign in' : 'Create patient account'} <ArrowRight size={17} /></button>
          </form>
          <div className="auth-switch">{mfaRequired ? <button onClick={() => { setMfaRequired(false); setOtp(''); setError('') }}>Back to password sign-in</button> : <>{mode === 'login' ? 'New to SecureLab?' : 'Already registered?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMfaRequired(false) }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></>}</div>
          <div className="auth-note"><Shield size={15} /> Your browser communicates with the API over the configured connection.</div>
        </div>
      </section>
    </main>
  )
}

function PasswordField({ label, ...props }) {
  const [show, setShow] = useState(false)
  return <label className="field"><span>{label}</span><div className="pw-wrap"><input {...props} type={show ? 'text' : 'password'} /><button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
}

function passwordStrength(pw) {
  let score = 0
  if (pw.length >= 10) score++
  if (pw.length >= 14) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const levels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent']
  return { score, label: pw ? levels[score] : '' }
}

function StrengthMeter({ password }) {
  const { score, label } = passwordStrength(password)
  if (!password) return null
  return <div className="strength"><div className="strength-bar"><span className={`level-${score}`} style={{ width: `${(score / 5) * 100}%` }} /></div><small>{label}</small></div>
}

function Field({ label, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>
}

function Dashboard({ session, onLogout }) {
  const { user, token } = session
  const [active, setActive] = useState(user.role === 'patient' ? 'reports' : user.role === 'lab' ? 'generate' : 'overview')
  const account = { id: 'account', label: 'My account', icon: UserCog }
  const nav = user.role === 'patient'
    ? [{ id: 'reports', label: 'My reports', icon: FileText }, account]
    : user.role === 'lab'
      ? [{ id: 'generate', label: 'Create report', icon: FilePlus2 }, { id: 'upload', label: 'Upload PDF', icon: UploadCloud }, { id: 'sent', label: 'Uploaded reports', icon: FileText }, account]
      : [{ id: 'overview', label: 'Overview', icon: Activity }, { id: 'users', label: 'All users', icon: Users }, { id: 'staff', label: 'Staff accounts', icon: Hospital }, { id: 'audit', label: 'Security audit', icon: ScanSearch }, account]

  return (
    <div className="app-shell" data-role={user.role}>
      {user.role === 'patient' && <div className="bg-fx" aria-hidden="true"><i className="fx-glow" /><i className="fx-wave fx-wave-bottom" /><i className="fx-wave fx-wave-right" /><i className="fx-pulse fx-pulse-shield" /><i className="fx-pulse fx-pulse-hospital" /><i className="fx-particles" /></div>}
      {user.role === 'patient' && <div className="fx-top" aria-hidden="true"><i className="fx-sparkles" /><i className="fx-sweep" /></div>}
      <aside className="sidebar">
        <div className="brand sidebar-brand"><span className="brand-mark"><ShieldCheck size={21} /></span><span>SecureLab</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="nav-list">
          {nav.map((item) => <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => setActive(item.id)}><item.icon size={18} /><span>{item.label}</span></button>)}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-security"><div className="security-icon"><LockKeyhole size={17} /></div><div><strong>Protected workspace</strong><small>Encrypted report storage</small></div></div>
          <div className="profile-mini"><div className="avatar">{user.name?.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><strong>{user.name}</strong><small>{user.role.toUpperCase()}</small></div><button className="icon-btn logout-btn" title="Sign out" onClick={onLogout}><LogOut size={17} /></button></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="breadcrumb"><span>SecureLab</span><span className="crumb-slash">/</span><strong>{nav.find((item) => item.id === active)?.label}</strong></div><div className="topbar-right"><span className="environment-tag"><span className="green-dot" /> DEMO ENVIRONMENT</span><div className="avatar avatar-small">{user.name?.slice(0, 1).toUpperCase()}</div></div></header>
        <div className="page-content" key={active}>
          {active === 'account' && <Account token={token} user={user} />}
          {active !== 'account' && user.role === 'patient' && <PatientReports token={token} user={user} />}
          {active !== 'account' && user.role === 'lab' && (active === 'generate' ? <LabGenerate token={token} /> : active === 'upload' ? <LabUpload token={token} /> : <LabSent token={token} />)}
          {active !== 'account' && user.role === 'admin' && active === 'overview' && <AdminOverview token={token} />}
          {active !== 'account' && user.role === 'admin' && active === 'users' && <AdminUsers token={token} me={user.id} />}
          {active !== 'account' && user.role === 'admin' && active === 'staff' && <AdminStaff token={token} />}
          {active !== 'account' && user.role === 'admin' && active === 'audit' && <AdminAudit token={token} />}
        </div>
      </main>
    </div>
  )
}

function PageTitle({ eyebrow, title, description, action }) {
  return <div className="page-title-row"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function MfaSecurityCard({ token, user }) {
  const [enabled, setEnabled] = useState(Boolean(user.mfa_enabled))
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function startSetup() {
    setBusy(true); setError(''); setMessage('')
    try { const result = await api('/api/auth/mfa/setup', { token, method: 'POST', body: JSON.stringify({}) }); setSecret(result.secret); setMessage('Add the secret below to an authenticator app, then enter the six-digit code to confirm.') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function enable() {
    setBusy(true); setError('')
    try { await api('/api/auth/mfa/enable', { token, method: 'POST', body: JSON.stringify({ code }) }); setEnabled(true); setSecret(''); setCode(''); setMessage('Two-factor authentication is enabled for your account.') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <section className="mfa-card"><div className="mfa-copy"><div className="mfa-icon"><Fingerprint size={18} /></div><div><strong>Two-factor authentication</strong><small>{enabled ? 'Authenticator verification is active for sign-in.' : 'Add a time-based one-time password (TOTP) to your sign-in.'}</small></div></div>{enabled ? <span className="status-pill"><CheckCircle2 size={12} /> ENABLED</span> : !secret ? <button className="btn btn-secondary btn-small" onClick={startSetup} disabled={busy}>{busy ? 'Preparing…' : 'Set up authenticator'}</button> : <div className="mfa-setup"><div className="mfa-secret"><span>Authenticator secret</span><code>{secret}</code></div><Field label="Six-digit authenticator code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" inputMode="numeric" /><button className="btn btn-primary btn-small" onClick={enable} disabled={busy || code.length !== 6}>Confirm MFA</button></div>}{(message || error) && <div className={`mfa-message ${error ? 'error-text' : ''}`}>{error || message}</div>}</section>
}

function PatientReports({ token, user }) {
  const [reports, setReports] = useState([])
  const [hasKey, setHasKey] = useState(false)
  const [keyPass, setKeyPass] = useState('')
  const [keyFile, setKeyFile] = useState(null)
  const [privateKey, setPrivateKey] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState({ type: '', text: '' })
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('new')

  async function refresh() {
    try {
      const [reportResult, keyResult] = await Promise.all([api('/api/reports', { token }), api('/api/keys/status', { token })])
      setReports(reportResult.reports); setHasKey(keyResult.has_public_key)
    } catch (err) { setNotice({ type: 'error', text: err.message }) }
  }
  useEffect(() => { refresh() }, [token])

  async function generateKey() {
    setBusy(true); setNotice({ type: '', text: '' })
    try {
      const { publicKeyPem, keyFile } = await createPatientKeyPair(keyPass)
      await api('/api/keys/register', { token, method: 'POST', body: JSON.stringify({ public_key_pem: publicKeyPem }) })
      downloadKeyFile(keyFile, `securelab-${user.patient_code || 'patient'}-private-key.securelabkey`)
      setHasKey(true)
      setNotice({ type: 'success', text: 'RSA key pair created. Your encrypted private-key file has been downloaded. Store it safely; the server does not have a copy.' })
      setKeyPass('')
    } catch (err) { setNotice({ type: 'error', text: err.message }) }
    finally { setBusy(false) }
  }

  async function unlockKey() {
    if (!keyFile) { setNotice({ type: 'error', text: 'Choose your .securelabkey file first.' }); return }
    setBusy(true); setNotice({ type: '', text: '' })
    try {
      const key = await unlockPatientKeyFile(keyFile, keyPass)
      setPrivateKey(key)
      setNotice({ type: 'success', text: 'Private key unlocked in this browser session. It is not uploaded to the server.' })
      setKeyPass('')
    } catch (err) { setNotice({ type: 'error', text: err.message }) }
    finally { setBusy(false) }
  }

  async function openReport(report, download = false) {
    if (!privateKey) { setNotice({ type: 'error', text: 'Unlock your private key before opening a report.' }); return }
    setBusy(true); setNotice({ type: '', text: '' })
    try {
      const payload = await api(`/api/reports/${report.id}/payload`, { token })
      const blob = await decryptAndVerifyReport(payload, privateKey)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; if (download) anchor.download = `${report.report_name.replace(/[^\w.-]+/g, '_')}.pdf`; else { anchor.target = '_blank'; anchor.rel = 'noopener' } document.body.appendChild(anchor); anchor.click(); anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setNotice({ type: 'success', text: `Verified: ${report.report_name}. AES-GCM authentication, SHA-256 fingerprint and hospital RSA-PSS signature are valid.` })
    } catch (err) { setNotice({ type: 'error', text: err.message }) }
    finally { setBusy(false) }
  }

  const shown = reports
    .filter((r) => `${r.report_name} ${r.test_type}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.report_name.localeCompare(b.report_name) : sort === 'old' ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at))

  return <>
    <PageTitle eyebrow="PATIENT DASHBOARD" title={`Good day, ${user.name.split(' ')[0]}`} description="Your laboratory reports are encrypted and accessible only with your private key." />
    <div className="stats-grid patient-stats">
      <StatCard icon={FileCheck2} label="Available reports" value={reports.length} hint="Your report library" />
      <StatCard icon={KeyRound} label="Encryption key" value={hasKey ? 'Registered' : 'Not set up'} hint={hasKey ? 'RSA public key on file' : 'Generate your key pair'} />
      <StatCard icon={ShieldCheck} label="Private key" value={privateKey ? 'Unlocked' : 'Locked'} hint="Stored only in this session" />
    </div>

    {!hasKey ? <section className="panel key-panel"><div className="panel-icon"><KeyRound size={22} /></div><div className="panel-content"><div className="eyebrow">ONE-TIME SETUP</div><h2>Generate your patient encryption key</h2><p>Your browser creates an RSA-2048 key pair. The public key is registered with SecureLab; your private key is encrypted with your passphrase and downloaded as a key file.</p><div className="inline-form key-create"><Field label="Key-file passphrase (12+ characters)" type="password" value={keyPass} onChange={(e) => setKeyPass(e.target.value)} placeholder="Create a strong passphrase" /><button className="btn btn-primary" onClick={generateKey} disabled={busy || keyPass.length < 12}>{busy ? 'Generating…' : 'Generate key pair'} <KeyRound size={16} /></button></div><div className="subtle-note"><AlertTriangle size={15} /> Losing the key file or passphrase means these reports cannot be decrypted. Securely back up the downloaded file.</div></div></section>
      : <section className="panel key-panel compact-key-panel"><div className="panel-icon"><LockKeyhole size={22} /></div><div className="panel-content"><div className="eyebrow">PATIENT KEY VAULT</div><h2>{privateKey ? 'Private key is unlocked' : 'Unlock your private key'}</h2><p>Select your downloaded <code>.securelabkey</code> file and enter its passphrase. Decryption happens inside your browser.</p>{!privateKey && <div className="inline-form key-unlock"><label className="field"><span>Encrypted key file</span><input type="file" accept=".securelabkey,.json,application/json" onChange={(e) => setKeyFile(e.target.files?.[0] || null)} /></label><Field label="Key-file passphrase" type="password" value={keyPass} onChange={(e) => setKeyPass(e.target.value)} placeholder="Enter your key passphrase" /><button className="btn btn-primary" onClick={unlockKey} disabled={busy || !keyFile || !keyPass}>{busy ? 'Unlocking…' : 'Unlock private key'} <LockKeyhole size={16} /></button></div>}{privateKey && <div className="unlocked-note"><CheckCircle2 size={16} /> Your key is available in memory until you sign out or reload this page.</div>}</div></section>}

    {notice.text && <div className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-error'}`}>{notice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{notice.text}</div>}
    <section className="section-block"><div className="section-heading"><div><div className="eyebrow">DOCUMENT LIBRARY</div><h2>Your laboratory reports</h2></div><button className="btn btn-secondary btn-small" onClick={refresh}><RefreshCw size={15} /> Refresh</button></div>
      {reports.length > 0 && <div className="toolbar"><label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by report name or test type" /></label><select className="select-sm" value={sort} onChange={(e) => setSort(e.target.value)}><option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name A–Z</option></select></div>}
      {reports.length > 0 && shown.length === 0 ? <EmptyState icon={Search} title="No matching reports" text="Try a different search term." /> : reports.length === 0 ? <EmptyState icon={FileText} title="No reports yet" text="When laboratory staff upload a report for your patient account, it will appear here in encrypted form." /> : <div className="report-grid">{shown.map((report) => <article className="report-card" key={report.id}><div className="report-card-top"><div className="file-icon"><FileText size={21} /></div><span className="encrypted-chip"><LockKeyhole size={12} /> ENCRYPTED</span></div><h3>{report.report_name}</h3><p>{report.test_type}</p><div className="report-meta"><span>{new Date(report.created_at).toLocaleDateString()}</span><span>PDF document</span></div><div className="card-actions"><button className="btn btn-outline" onClick={() => openReport(report)} disabled={busy || !privateKey}><Eye size={16} /> {privateKey ? 'Decrypt & verify' : 'Unlock key to view'}</button><button className="btn btn-secondary icon-only" title="Decrypt, verify and download PDF" aria-label="Download verified PDF" onClick={() => openReport(report, true)} disabled={busy || !privateKey}><Download size={16} /></button></div></article>)}</div>}
    </section>
  </>
}

const TEST_TEMPLATES = {
  'Complete Blood Count': [['Hemoglobin', 'g/dL', 12, 16], ['RBC count', 'million/µL', 4.2, 5.9], ['WBC count', '×10³/µL', 4, 11], ['Platelets', '×10³/µL', 150, 400], ['Hematocrit', '%', 36, 48], ['MCV', 'fL', 80, 100]],
  'Lipid Profile': [['Total cholesterol', 'mg/dL', '', 200], ['LDL cholesterol', 'mg/dL', '', 100], ['HDL cholesterol', 'mg/dL', 40, ''], ['Triglycerides', 'mg/dL', '', 150]],
  'Blood Glucose': [['Fasting glucose', 'mg/dL', 70, 99], ['Post-prandial glucose', 'mg/dL', 70, 140], ['HbA1c', '%', 4, 5.6]],
  'Liver Function Test': [['ALT (SGPT)', 'U/L', 7, 56], ['AST (SGOT)', 'U/L', 10, 40], ['Alkaline phosphatase', 'U/L', 44, 147], ['Total bilirubin', 'mg/dL', 0.1, 1.2], ['Albumin', 'g/dL', 3.5, 5]],
  'Kidney Function Test': [['Creatinine', 'mg/dL', 0.6, 1.3], ['Blood urea nitrogen', 'mg/dL', 7, 20], ['Uric acid', 'mg/dL', 3.5, 7.2], ['Sodium', 'mmol/L', 135, 145], ['Potassium', 'mmol/L', 3.5, 5.1]],
  'Thyroid Profile': [['TSH', 'mIU/L', 0.4, 4], ['Free T4', 'ng/dL', 0.8, 1.8], ['Free T3', 'pg/mL', 2.3, 4.2]],
  'Urine Analysis': [['pH', '', 4.5, 8], ['Specific gravity', '', 1.005, 1.03], ['Protein', '', '', ''], ['Glucose', '', '', '']],
  'Other': [['', '', '', '']],
}
const blankRow = () => ({ name: '', value: '', unit: '', low: '', high: '' })
const rowsFor = (type) => TEST_TEMPLATES[type].map(([name, unit, low, high]) => ({ name, value: '', unit, low: String(low), high: String(high) }))

// Mirrors the server-side rule so the preview matches the generated PDF.
function resultFlag({ value, low, high }) {
  const v = parseFloat(value), lo = parseFloat(low), hi = parseFloat(high)
  if (value === '' || Number.isNaN(v) || (Number.isNaN(lo) && Number.isNaN(hi))) return ''
  if (!Number.isNaN(lo) && v < lo) return 'LOW'
  if (!Number.isNaN(hi) && v > hi) return 'HIGH'
  return 'NORMAL'
}
const rangeText = ({ low, high }) => low && high ? `${low} – ${high}` : low ? `≥ ${low}` : high ? `≤ ${high}` : '—'

function LabGenerate({ token }) {
  const [search, setSearch] = useState('')
  const [patients, setPatients] = useState([])
  const [selectedPatient, setSelectedPatient] = useState('')
  const [testType, setTestType] = useState('Complete Blood Count')
  const [reportName, setReportName] = useState('')
  const [collectedOn, setCollectedOn] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState(() => rowsFor('Complete Blood Count'))
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState({ type: '', text: '' })

  async function searchPatients(e) {
    e?.preventDefault()
    try { const r = await api(`/api/lab/patients?search=${encodeURIComponent(search)}`, { token }); setPatients(r.patients) }
    catch (err) { setNotice({ type: 'error', text: err.message }) }
  }
  useEffect(() => { searchPatients() }, [])

  function changeType(type) {
    if (rows.some((r) => r.value) && !window.confirm('Switching the test type replaces the current results. Continue?')) return
    setTestType(type); setRows(rowsFor(type))
  }
  const setCell = (i, key, value) => setRows((old) => old.map((r, n) => n === i ? { ...r, [key]: value } : r))
  const chosen = patients.find((p) => p.email === selectedPatient)
  const filled = rows.filter((r) => r.name.trim() && r.value.trim())
  const abnormal = filled.filter((r) => ['HIGH', 'LOW'].includes(resultFlag(r))).length
  const title = reportName.trim() || `${testType} – ${new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`

  async function submit(e) {
    e.preventDefault(); setBusy(true); setNotice({ type: '', text: '' })
    try {
      const result = await api('/api/reports/generate', { token, method: 'POST', body: JSON.stringify({ patient_email: selectedPatient, report_name: title, test_type: testType, collected_on: collectedOn, notes, results: filled }) })
      setNotice({ type: 'success', text: `${result.message} The PDF was encrypted before storage.` })
      setRows(rowsFor(testType)); setNotes(''); setReportName('')
    } catch (err) { setNotice({ type: 'error', text: err.message }) }
    finally { setBusy(false) }
  }

  return <>
    <PageTitle eyebrow="LABORATORY WORKSPACE" title="Create a lab report" description="Enter test results and SecureLab builds the PDF, flags values outside the reference range, then encrypts and sends it to the patient." />
    <div className="upload-layout">
      <section className="panel upload-form-panel"><div className="section-heading"><div><div className="eyebrow">NEW LAB REPORT</div><h2>Report details</h2></div><div className="secure-label"><ShieldCheck size={15} /> ENCRYPTED ON SEND</div></div>
        <form className="form-stack" onSubmit={submit}>
          <div className="field"><span>Patient account</span><div className="patient-select"><select value={selectedPatient} onChange={(e) => setSelectedPatient(e.target.value)} required><option value="">Select a patient</option>{patients.filter((p) => p.has_public_key).map((p) => <option key={p.id} value={p.email}>{p.name} — {p.patient_code || p.email}</option>)}</select></div>{chosen && <small className="field-hint success-text">RSA public key registered · {chosen.email}</small>}</div>
          <div className="patient-search-row"><Field label="Search patients" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or patient ID" /><button type="button" className="btn btn-secondary search-btn" onClick={() => searchPatients()}><ScanSearch size={16} /> Search</button></div>
          {patients.length === 0 && <div className="inline-warning">No patient accounts found. Ask the patient to register and generate their encryption key.</div>}
          <div className="two-col">
            <label className="field"><span>Test category</span><select value={testType} onChange={(e) => changeType(e.target.value)}>{Object.keys(TEST_TEMPLATES).map((t) => <option key={t}>{t}</option>)}</select></label>
            <Field label="Sample collected on" type="date" value={collectedOn} onChange={(e) => setCollectedOn(e.target.value)} />
          </div>
          <Field label="Report title (optional)" value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder={title} />

          <div className="field"><span>Results</span>
            <div className="result-editor">
              <div className="result-row result-head"><span>Parameter</span><span>Result</span><span>Unit</span><span>Ref. low</span><span>Ref. high</span><span>Flag</span><span /></div>
              {rows.map((r, i) => { const flag = resultFlag(r); return <div className="result-row" key={i}>
                <input aria-label="Parameter" value={r.name} onChange={(e) => setCell(i, 'name', e.target.value)} placeholder="Parameter" maxLength={80} />
                <input aria-label="Result" value={r.value} onChange={(e) => setCell(i, 'value', e.target.value)} placeholder="Value" maxLength={40} className={flag === 'HIGH' ? 'is-high' : flag === 'LOW' ? 'is-low' : ''} />
                <input aria-label="Unit" value={r.unit} onChange={(e) => setCell(i, 'unit', e.target.value)} placeholder="Unit" maxLength={20} />
                <input aria-label="Reference low" inputMode="decimal" value={r.low} onChange={(e) => setCell(i, 'low', e.target.value)} placeholder="Low" maxLength={20} />
                <input aria-label="Reference high" inputMode="decimal" value={r.high} onChange={(e) => setCell(i, 'high', e.target.value)} placeholder="High" maxLength={20} />
                <span className={`flag flag-${flag.toLowerCase()}`}>{flag || '—'}</span>
                <button type="button" className="icon-btn danger-btn" aria-label="Remove row" onClick={() => setRows((old) => old.filter((_, n) => n !== i))} disabled={rows.length === 1}><Trash2 size={15} /></button>
              </div> })}
            </div>
            <button type="button" className="btn btn-secondary btn-small add-row" onClick={() => setRows((old) => [...old, blankRow()])} disabled={rows.length >= 40}><Plus size={15} /> Add parameter</button>
          </div>
          <label className="field"><span>Clinical notes (optional)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1500} placeholder="Interpretation, recommendations or follow-up…" /></label>
          {notice.text && <div className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-error'}`}>{notice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{notice.text}</div>}
          <button className="btn btn-primary btn-full" disabled={busy || !chosen?.has_public_key || filled.length === 0}>{busy ? 'Generating & encrypting…' : 'Generate, encrypt & send'} <LockKeyhole size={16} /></button>
        </form>
      </section>

      <aside className="panel preview-panel"><div className="eyebrow">LIVE PREVIEW</div>
        <div className="paper">
          <div className="paper-brand">SecureLab Diagnostics</div>
          <h3>{title}</h3><div className="paper-sub">{testType}</div>
          <div className="paper-meta"><div><small>Patient</small>{chosen?.name || '—'}</div><div><small>Patient ID</small>{chosen?.patient_code || '—'}</div><div><small>Collected</small>{collectedOn || '—'}</div></div>
          <table className="paper-table"><thead><tr><th>Parameter</th><th>Result</th><th>Range</th><th>Flag</th></tr></thead><tbody>
            {filled.length ? filled.map((r, i) => { const flag = resultFlag(r); return <tr key={i} className={['HIGH', 'LOW'].includes(flag) ? 'abnormal' : ''}><td>{r.name}</td><td><strong>{r.value}</strong> {r.unit}</td><td>{rangeText(r)}</td><td><span className={`flag flag-${flag.toLowerCase()}`}>{flag || '—'}</span></td></tr> }) : <tr><td colSpan={4} className="paper-empty">Results you enter appear here.</td></tr>}
          </tbody></table>
          {notes.trim() && <div className="paper-notes"><small>Clinical notes</small>{notes}</div>}
        </div>
        <div className="preview-summary"><span><strong>{filled.length}</strong> results</span><span className={abnormal ? 'warn-text' : ''}><strong>{abnormal}</strong> outside range</span></div>
        <p className="muted-text">The patient receives this as an encrypted PDF. After sending, you will not be able to open it.</p>
      </aside>
    </div>
  </>
}

function LabUpload({ token }) {
  const [search, setSearch] = useState('')
  const [patients, setPatients] = useState([])
  const [selectedPatient, setSelectedPatient] = useState('')
  const [reportName, setReportName] = useState('')
  const [testType, setTestType] = useState('Complete Blood Count')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState({ type: '', text: '' })

  async function searchPatients(e) {
    e?.preventDefault(); setNotice({ type: '', text: '' })
    try { const result = await api(`/api/lab/patients?search=${encodeURIComponent(search)}`, { token }); setPatients(result.patients) }
    catch (err) { setNotice({ type: 'error', text: err.message }) }
  }
  useEffect(() => { searchPatients() }, [])

  async function upload(e) {
    e.preventDefault(); setBusy(true); setNotice({ type: '', text: '' })
    try {
      const body = new FormData()
      body.append('patient_email', selectedPatient); body.append('report_name', reportName); body.append('test_type', testType); body.append('file', file)
      const result = await api('/api/reports/upload', { token, method: 'POST', body })
      setNotice({ type: 'success', text: `${result.message} The original PDF was encrypted before storage.` })
      setReportName(''); setFile(null); e.target.reset()
    } catch (err) { setNotice({ type: 'error', text: err.message }) }
    finally { setBusy(false) }
  }

  const chosen = patients.find((p) => p.email === selectedPatient)
  return <>
    <PageTitle eyebrow="LABORATORY WORKSPACE" title="Secure report upload" description="Upload a PDF report. SecureLab encrypts it for the patient's RSA public key before saving it." />
    <div className="workflow-steps"><div className="workflow-step active"><span>01</span><div><strong>Select patient</strong><small>Find registered patient</small></div></div><div className="workflow-line" /><div className="workflow-step"><span>02</span><div><strong>Add report</strong><small>Attach PDF document</small></div></div><div className="workflow-line" /><div className="workflow-step"><span>03</span><div><strong>Encrypt & store</strong><small>AES + RSA protection</small></div></div></div>
    <div className="upload-layout">
      <section className="panel upload-form-panel"><div className="section-heading"><div><div className="eyebrow">NEW LAB REPORT</div><h2>Report details</h2></div><div className="secure-label"><ShieldCheck size={15} /> SECURE UPLOAD</div></div>
        <form className="form-stack" onSubmit={upload}>
          <div className="field"><span>Patient account</span><div className="patient-select"><select value={selectedPatient} onChange={(e) => setSelectedPatient(e.target.value)} required><option value="">Select a patient</option>{patients.filter((p) => p.has_public_key).map((p) => <option key={p.id} value={p.email}>{p.name} — {p.patient_code || p.email}</option>)}</select></div>{chosen && <small className="field-hint success-text">RSA public key registered · {chosen.email}</small>}</div>
          <div className="patient-search-row"><Field label="Search patients" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or patient ID" /><button type="button" className="btn btn-secondary search-btn" onClick={() => searchPatients()}><ScanSearch size={16} /> Search</button></div>
          {patients.length === 0 && <div className="inline-warning">No patient accounts found. Ask the patient to register and generate their encryption key.</div>}
          <Field label="Report title" value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="e.g. Complete Blood Count – October 2026" required />
          <label className="field"><span>Test category</span><select value={testType} onChange={(e) => setTestType(e.target.value)}><option>Complete Blood Count</option><option>Lipid Profile</option><option>Blood Glucose</option><option>Liver Function Test</option><option>Kidney Function Test</option><option>Thyroid Profile</option><option>Urine Analysis</option><option>Other</option></select></label>
          <label className="field"><span>PDF report</span><div className="file-drop"><input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} required /><UploadCloud size={24} /><strong>{file ? file.name : 'Choose a PDF report'}</strong><small>{file ? `${(file.size / 1024).toFixed(0)} KB · selected` : 'PDF only · maximum configured size 12 MB'}</small></div></label>
          {notice.text && <div className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-error'}`}>{notice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{notice.text}</div>}
          <button className="btn btn-primary btn-full" disabled={busy || !chosen?.has_public_key}>{busy ? 'Encrypting report…' : 'Encrypt & upload report'} <LockKeyhole size={16} /></button>
        </form>
      </section>
      <aside className="panel encryption-aside"><div className="aside-illustration"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="big-shield"><ShieldCheck size={44} /></div></div><div className="eyebrow">AUTOMATIC PROTECTION</div><h3>Encryption happens before storage</h3><p>The backend processes the PDF in memory, then stores only ciphertext and cryptographic metadata.</p><div className="crypto-list"><div><span>AES-256-GCM</span><small>PDF confidentiality + authentication tag</small></div><div><span>RSA-OAEP / SHA-256</span><small>Patient-specific AES key wrapping</small></div><div><span>RSA-PSS / SHA-256</span><small>Hospital authenticity signature</small></div></div></aside>
    </div>
  </>
}

function LabSent({ token }) {
  const [reports, setReports] = useState([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState({ type: '', text: '' })
  const load = () => api('/api/reports', { token }).then((r) => setReports(r.reports)).catch((e) => setNotice({ type: 'error', text: e.message }))
  useEffect(() => { load() }, [token])

  async function remove(report) {
    if (!window.confirm(`Delete "${report.report_name}" for ${report.patient_name}? The encrypted file will be permanently removed.`)) return
    try { await api(`/api/reports/${report.id}`, { token, method: 'DELETE' }); setNotice({ type: 'success', text: 'Report deleted.' }); load() }
    catch (e) { setNotice({ type: 'error', text: e.message }) }
  }

  const now = Date.now(), day = 86400000
  const today = reports.filter((r) => now - new Date(r.created_at) < day).length
  const week = reports.filter((r) => now - new Date(r.created_at) < 7 * day).length
  const patients = new Set(reports.map((r) => r.patient_email)).size
  const q = query.trim().toLowerCase()
  const shown = reports.filter((r) => `${r.report_name} ${r.patient_name} ${r.patient_email} ${r.test_type}`.toLowerCase().includes(q))

  return <>
    <PageTitle eyebrow="LABORATORY WORKSPACE" title="Uploaded reports" description="Reports uploaded by your laboratory account. Original PDFs are not available to staff after encryption." />
    <div className="stats-grid">
      <StatCard icon={FileCheck2} label="Total uploaded" value={reports.length} hint="By this staff account" />
      <StatCard icon={Clock} label="Last 24 hours" value={today} hint="Uploaded today" />
      <StatCard icon={Activity} label="Last 7 days" value={week} hint="This week" />
      <StatCard icon={Users} label="Patients served" value={patients} hint="Distinct patients" />
    </div>
    {notice.text && <div className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 16 }}>{notice.text}</div>}
    {reports.length > 0 && <div className="toolbar"><label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by report, patient or test type" /></label></div>}
    {shown.length ? <div className="table-wrap"><table><thead><tr><th>Report</th><th>Patient</th><th>Test type</th><th>Uploaded</th><th>Status</th><th /></tr></thead><tbody>{shown.map((r) => <tr key={r.id}><td><strong>{r.report_name}</strong><small>{r.original_filename}</small></td><td>{r.patient_name}<small>{r.patient_email}</small></td><td>{r.test_type}</td><td>{new Date(r.created_at).toLocaleString()}</td><td><span className="status-pill"><LockKeyhole size={12} /> Encrypted</span></td><td><button className="icon-btn danger-btn" title="Delete report" aria-label={`Delete ${r.report_name}`} onClick={() => remove(r)}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={FileText} title={reports.length ? 'No matching reports' : 'No uploads yet'} text={reports.length ? 'Try a different search term.' : 'Reports you upload will appear here.'} />}
  </>
}

function AdminOverview({ token }) {
  const [data, setData] = useState(null)
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { Promise.all([api('/api/admin/overview', { token }), api('/api/admin/audit-logs?limit=6', { token })]).then(([overview, audit]) => { setData(overview); setLogs(audit.logs) }).catch((e) => setError(e.message)) }, [token])
  return <><PageTitle eyebrow="ADMINISTRATION" title="Security overview" description="Monitor SecureLab accounts, encrypted reports and recent security activity." />{error && <div className="alert alert-error">{error}</div>}<div className="stats-grid">{data && <><StatCard icon={Users} label="Patients" value={data.patients} hint="Registered patient accounts" /><StatCard icon={Hospital} label="Laboratory staff" value={data.laboratory_staff} hint="Authorised staff accounts" /><StatCard icon={FileCheck2} label="Encrypted reports" value={data.reports} hint="Stored encrypted documents" /><StatCard icon={Power} label="Active accounts" value={data.active_users} hint="Able to sign in" /><StatCard icon={Activity} label="Audit events" value={data.audit_events} hint="Recorded security actions" /></>}</div><section className="section-block"><div className="section-heading"><div><div className="eyebrow">LATEST ACTIVITY</div><h2>Recent audit events</h2></div></div><AuditTable logs={logs} /></section></>
}

function AdminStaff({ token }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'lab' })
  const [notice, setNotice] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)
  const [users, setUsers] = useState([])
  async function refresh() { try { const r = await api('/api/admin/users', { token }); setUsers(r.users.filter((u) => u.role !== 'patient')) } catch (e) { setNotice({ type: 'error', text: e.message }) } }
  useEffect(() => { refresh() }, [token])
  async function submit(e) {
    e.preventDefault(); setBusy(true); setNotice({ type: '', text: '' })
    try { await api('/api/admin/staff', { token, method: 'POST', body: JSON.stringify(form) }); setNotice({ type: 'success', text: 'Staff account created successfully.' }); setForm({ name: '', email: '', password: '', role: 'lab' }); refresh() }
    catch (e) { setNotice({ type: 'error', text: e.message }) } finally { setBusy(false) }
  }
  return <><PageTitle eyebrow="ADMINISTRATION" title="Staff accounts" description="Create authorised laboratory and administrator accounts. Patient accounts are self-registered." /><div className="admin-grid"><section className="panel"><div className="eyebrow">CREATE ACCOUNT</div><h2>New staff member</h2><form className="form-stack" onSubmit={submit}><Field label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Staff member name" /><Field label="Email address" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="staff@hospital.org" /><Field label="Temporary password (12+ characters)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required placeholder="Set a strong password" /><label className="field"><span>Role</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="lab">Laboratory staff</option><option value="admin">Administrator</option></select></label>{notice.text && <div className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-error'}`}>{notice.text}</div>}<button className="btn btn-primary btn-full" disabled={busy}>{busy ? 'Creating…' : 'Create staff account'} <Plus size={16} /></button></form></section><section className="panel"><div className="section-heading"><div><div className="eyebrow">AUTHORISED USERS</div><h2>Staff directory</h2></div><button className="icon-btn" onClick={refresh} title="Refresh"><RefreshCw size={16} /></button></div><div className="staff-list">{users.map((u) => <div className="staff-row" key={u.id}><div className="avatar">{u.name.slice(0, 1).toUpperCase()}</div><div className="staff-copy"><strong>{u.name}</strong><small>{u.email}</small></div><span className={`role-tag role-${u.role}`}>{u.role}</span></div>)}</div></section></div></>
}

function AdminAudit({ token }) {
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('')
  useEffect(() => { api('/api/admin/audit-logs?limit=300', { token }).then((r) => setLogs(r.logs)).catch((e) => setError(e.message)) }, [token])
  const actions = [...new Set(logs.map((l) => l.action))].sort()
  const q = query.trim().toLowerCase()
  const shown = logs.filter((l) => (!action || l.action === action) && `${l.actor_email} ${l.details} ${l.ip_address}`.toLowerCase().includes(q))

  function exportCsv() {
    // Prefix spreadsheet-formula characters so exported cells cannot execute as formulas.
    const cell = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replaceAll('"', '""')}"` }
    const rows = [['Time', 'Event', 'Actor', 'Details', 'IP address'], ...shown.map((l) => [l.created_at, l.action, l.actor_email, l.details, l.ip_address])]
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `securelab-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <><PageTitle eyebrow="SECURITY MONITORING" title="Audit trail" description="Review authentication, key-registration, report-upload and report-access events." action={<button className="btn btn-secondary btn-small" onClick={exportCsv} disabled={!shown.length}><FileDown size={15} /> Export CSV</button>} />
    {error && <div className="alert alert-error">{error}</div>}
    <div className="toolbar"><label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search actor, details or IP address" /></label><select className="select-sm" value={action} onChange={(e) => setAction(e.target.value)}><option value="">All events</option>{actions.map((a) => <option key={a} value={a}>{a.replaceAll('_', ' ')}</option>)}</select></div>
    <AuditTable logs={shown} /></>
}

function AuditTable({ logs }) {
  if (!logs.length) return <EmptyState icon={ScanSearch} title="No audit events" text="Security events will appear here as users interact with the portal." />
  return <div className="table-wrap"><table><thead><tr><th>Event</th><th>Actor</th><th>Details</th><th>IP address</th><th>Time</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td><span className="event-label"><span className="green-dot" />{log.action.replaceAll('_', ' ')}</span></td><td>{log.actor_email || 'System'}</td><td>{log.details || '—'}</td><td>{log.ip_address || '—'}</td><td>{new Date(log.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>
}

function AdminUsers({ token, me }) {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [notice, setNotice] = useState({ type: '', text: '' })
  async function load(term = search) {
    try { const r = await api(`/api/admin/users?${new URLSearchParams({ search: term, role })}`, { token }); setUsers(r.users) }
    catch (e) { setNotice({ type: 'error', text: e.message }) }
  }
  useEffect(() => { load() }, [role])
  async function toggle(u) {
    if (u.is_active && !window.confirm(`Deactivate ${u.name}? They will be signed out and unable to sign in until reactivated.`)) return
    try { await api(`/api/admin/users/${u.id}/active`, { token, method: 'PATCH', body: JSON.stringify({ active: !u.is_active }) }); setNotice({ type: 'success', text: `${u.name} ${u.is_active ? 'deactivated' : 'reactivated'}.` }); load() }
    catch (e) { setNotice({ type: 'error', text: e.message }) }
  }
  return <>
    <PageTitle eyebrow="ADMINISTRATION" title="All users" description="Find any patient, laboratory or administrator account and control whether it can sign in." />
    {notice.text && <div className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 16 }}>{notice.text}</div>}
    <form className="toolbar" onSubmit={(e) => { e.preventDefault(); load() }}><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or patient ID" /></label><select className="select-sm" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option><option value="patient">Patients</option><option value="lab">Laboratory staff</option><option value="admin">Administrators</option></select><button className="btn btn-secondary btn-small">Search</button></form>
    {users.length ? <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Joined</th><th>2FA</th><th>Status</th><th /></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td><strong>{u.name}</strong><small>{u.email}{u.patient_code ? ` · ${u.patient_code}` : ''}</small></td><td><span className={`role-tag role-${u.role}`}>{u.role}</span></td><td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td><td>{u.mfa_enabled ? 'On' : 'Off'}</td><td><span className={u.is_active ? 'status-pill' : 'status-pill status-off'}>{u.is_active ? 'Active' : 'Inactive'}</span></td><td><button className="btn btn-secondary btn-small" disabled={u.id === me} title={u.id === me ? 'You cannot deactivate yourself' : ''} onClick={() => toggle(u)}>{u.is_active ? 'Deactivate' : 'Reactivate'}</button></td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="No users found" text="Try a different search or role filter." />}
  </>
}

function Account({ token, user }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState({ type: '', text: '' })
  const [activity, setActivity] = useState([])
  const mismatch = form.confirm && form.new_password !== form.confirm
  const loadActivity = () => api('/api/auth/activity', { token }).then((r) => setActivity(r.activity)).catch(() => {})
  useEffect(() => { loadActivity() }, [token])

  async function submit(e) {
    e.preventDefault(); setBusy(true); setNotice({ type: '', text: '' })
    try {
      const result = await api('/api/auth/change-password', { token, method: 'POST', body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }) })
      setNotice({ type: 'success', text: result.message }); setForm({ current_password: '', new_password: '', confirm: '' }); loadActivity()
    } catch (err) { setNotice({ type: 'error', text: err.message }) }
    finally { setBusy(false) }
  }

  return <>
    <PageTitle eyebrow="ACCOUNT" title="My account" description="Your profile, sign-in security and recent activity." />
    <section className="panel profile-card"><div className="avatar avatar-large">{user.name?.slice(0, 1).toUpperCase()}</div><div className="profile-details"><h2>{user.name}</h2><span>{user.email}</span></div><div className="profile-facts"><div><small>Role</small><strong>{user.role}</strong></div>{user.patient_code && <div><small>Patient ID</small><strong>{user.patient_code}</strong></div>}</div></section>
    <div className="account-grid">
      <div>
        <MfaSecurityCard token={token} user={user} />
        <section className="panel"><div className="eyebrow">PASSWORD</div><h2>Change password</h2>
          <form className="form-stack" onSubmit={submit}>
            <PasswordField label="Current password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} autoComplete="current-password" required />
            <div className="field-group"><PasswordField label={`New password (${user.role === 'patient' ? '10' : '12'}+ characters, letters and numbers)`} value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} autoComplete="new-password" required /><StrengthMeter password={form.new_password} /></div>
            <PasswordField label="Confirm new password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" required />
            {mismatch && <small className="error-text">Passwords do not match.</small>}
            {notice.text && <div className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-error'}`}>{notice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{notice.text}</div>}
            <button className="btn btn-primary" disabled={busy || !form.current_password || !form.new_password || form.new_password !== form.confirm}>{busy ? 'Updating…' : 'Update password'} <KeyRound size={16} /></button>
          </form>
        </section>
      </div>
      <section className="panel"><div className="section-heading"><div><div className="eyebrow">SECURITY</div><h2>Recent activity</h2></div><button className="icon-btn" onClick={loadActivity} title="Refresh"><RefreshCw size={16} /></button></div>
        {activity.length ? <div className="activity-list">{activity.map((a) => <div className="activity-row" key={a.id}><span className="green-dot" /><div><strong>{a.action.replaceAll('_', ' ')}</strong><small>{new Date(a.created_at).toLocaleString()}{a.ip_address ? ` · ${a.ip_address}` : ''}</small></div></div>)}</div> : <p className="muted-text">No activity recorded yet.</p>}
      </section>
    </div>
  </>
}

function StatCard({ icon: Icon, label, value, hint }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={18} /></span></div><div className="stat-value">{value}</div><div className="stat-hint">{hint}</div></article>
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={25} /></div><h3>{title}</h3><p>{text}</p></div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
