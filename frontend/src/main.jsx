import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowRight, BadgeCheck, FileCheck2, FileText, Fingerprint,
  Hospital, KeyRound, LockKeyhole, LogOut, Plus, ScanSearch, Shield, ShieldCheck,
  Users, UploadCloud, AlertTriangle, CheckCircle2, Eye, RefreshCw,
} from 'lucide-react'
import { api } from './api'
import { createPatientKeyPair, decryptAndVerifyReport, downloadKeyFile, unlockPatientKeyFile } from './crypto'
import './styles.css'

function App() {
  const [session, setSession] = useState(null)

  const logout = () => setSession(null)
  if (!session) return <AuthScreen onAuth={setSession} />

  return (
    <Dashboard session={session} onLogout={logout} />
  )
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login')
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
        <div className="auth-visual-footer"><span>CRYPTOGRAPHY & NETWORK SECURITY PROJECT</span><span>DEMO ENVIRONMENT</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
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
            <Field label="Password" name="password" type="password" value={form.password} onChange={change} placeholder={mode === 'register' ? 'At least 10 characters' : 'Enter your password'} required />
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

function Field({ label, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>
}

function Dashboard({ session, onLogout }) {
  const { user, token } = session
  const [active, setActive] = useState(user.role === 'patient' ? 'reports' : user.role === 'lab' ? 'upload' : 'overview')
  const nav = user.role === 'patient'
    ? [{ id: 'reports', label: 'My reports', icon: FileText }]
    : user.role === 'lab'
      ? [{ id: 'upload', label: 'Upload report', icon: UploadCloud }, { id: 'sent', label: 'Uploaded reports', icon: FileText }]
      : [{ id: 'overview', label: 'Overview', icon: Activity }, { id: 'staff', label: 'Staff accounts', icon: Users }, { id: 'audit', label: 'Security audit', icon: ScanSearch }]

  return (
    <div className="app-shell">
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
        <div className="page-content">
          <MfaSecurityCard token={token} user={user} />
          {user.role === 'patient' && <PatientReports token={token} user={user} />}
          {user.role === 'lab' && (active === 'upload' ? <LabUpload token={token} /> : <LabSent token={token} />)}
          {user.role === 'admin' && active === 'overview' && <AdminOverview token={token} />}
          {user.role === 'admin' && active === 'staff' && <AdminStaff token={token} />}
          {user.role === 'admin' && active === 'audit' && <AdminAudit token={token} />}
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

  async function openReport(report) {
    if (!privateKey) { setNotice({ type: 'error', text: 'Unlock your private key before opening a report.' }); return }
    setBusy(true); setNotice({ type: '', text: '' })
    try {
      const payload = await api(`/api/reports/${report.id}/payload`, { token })
      const blob = await decryptAndVerifyReport(payload, privateKey)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener'; document.body.appendChild(anchor); anchor.click(); anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setNotice({ type: 'success', text: `Verified: ${report.report_name}. AES-GCM authentication, SHA-256 fingerprint and hospital RSA-PSS signature are valid.` })
    } catch (err) { setNotice({ type: 'error', text: err.message }) }
    finally { setBusy(false) }
  }

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
      {reports.length === 0 ? <EmptyState icon={FileText} title="No reports yet" text="When laboratory staff upload a report for your patient account, it will appear here in encrypted form." /> : <div className="report-grid">{reports.map((report) => <article className="report-card" key={report.id}><div className="report-card-top"><div className="file-icon"><FileText size={21} /></div><span className="encrypted-chip"><LockKeyhole size={12} /> ENCRYPTED</span></div><h3>{report.report_name}</h3><p>{report.test_type}</p><div className="report-meta"><span>{new Date(report.created_at).toLocaleDateString()}</span><span>PDF document</span></div><button className="btn btn-outline btn-full" onClick={() => openReport(report)} disabled={busy || !privateKey}><Eye size={16} /> {privateKey ? 'Decrypt & verify report' : 'Unlock key to view'}</button></article>)}</div>}
    </section>
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
  useEffect(() => { api('/api/reports', { token }).then((r) => setReports(r.reports)).catch(() => {}) }, [token])
  return <><PageTitle eyebrow="LABORATORY WORKSPACE" title="Uploaded reports" description="Reports uploaded by your laboratory account. Original PDFs are not available to staff after encryption." /><div className="stats-grid"><StatCard icon={FileCheck2} label="Reports uploaded" value={reports.length} hint="By this staff account" /><StatCard icon={ShieldCheck} label="Storage format" value="Encrypted" hint="AES-256-GCM ciphertext" /></div>{reports.length ? <div className="table-wrap"><table><thead><tr><th>Report</th><th>Patient</th><th>Test type</th><th>Uploaded</th><th>Status</th></tr></thead><tbody>{reports.map((r) => <tr key={r.id}><td><strong>{r.report_name}</strong><small>{r.original_filename}</small></td><td>{r.patient_name}<small>{r.patient_email}</small></td><td>{r.test_type}</td><td>{new Date(r.created_at).toLocaleString()}</td><td><span className="status-pill"><LockKeyhole size={12} /> Encrypted</span></td></tr>)}</tbody></table></div> : <EmptyState icon={FileText} title="No uploads yet" text="Reports you upload will appear here." />}</>
}

function AdminOverview({ token }) {
  const [data, setData] = useState(null)
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { Promise.all([api('/api/admin/overview', { token }), api('/api/admin/audit-logs?limit=6', { token })]).then(([overview, audit]) => { setData(overview); setLogs(audit.logs) }).catch((e) => setError(e.message)) }, [token])
  return <><PageTitle eyebrow="ADMINISTRATION" title="Security overview" description="Monitor SecureLab accounts, encrypted reports and recent security activity." />{error && <div className="alert alert-error">{error}</div>}<div className="stats-grid">{data && <><StatCard icon={Users} label="Patients" value={data.patients} hint="Registered patient accounts" /><StatCard icon={Hospital} label="Laboratory staff" value={data.laboratory_staff} hint="Authorised staff accounts" /><StatCard icon={FileCheck2} label="Encrypted reports" value={data.reports} hint="Stored encrypted documents" /><StatCard icon={Activity} label="Audit events" value={data.audit_events} hint="Recorded security actions" /></>}</div><section className="section-block"><div className="section-heading"><div><div className="eyebrow">LATEST ACTIVITY</div><h2>Recent audit events</h2></div></div><AuditTable logs={logs} /></section></>
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
  useEffect(() => { api('/api/admin/audit-logs?limit=300', { token }).then((r) => setLogs(r.logs)).catch((e) => setError(e.message)) }, [token])
  return <><PageTitle eyebrow="SECURITY MONITORING" title="Audit trail" description="Review authentication, key-registration, report-upload and report-access events." />{error && <div className="alert alert-error">{error}</div>}<AuditTable logs={logs} /></>
}

function AuditTable({ logs }) {
  if (!logs.length) return <EmptyState icon={ScanSearch} title="No audit events" text="Security events will appear here as users interact with the portal." />
  return <div className="table-wrap"><table><thead><tr><th>Event</th><th>Actor</th><th>Details</th><th>IP address</th><th>Time</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td><span className="event-label"><span className="green-dot" />{log.action.replaceAll('_', ' ')}</span></td><td>{log.actor_email || 'System'}</td><td>{log.details || '—'}</td><td>{log.ip_address || '—'}</td><td>{new Date(log.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>
}

function StatCard({ icon: Icon, label, value, hint }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={18} /></span></div><div className="stat-value">{value}</div><div className="stat-hint">{hint}</div></article>
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={25} /></div><h3>{title}</h3><p>{text}</p></div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
