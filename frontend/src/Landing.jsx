import React, { useEffect, useRef, useState } from 'react'
import {
  ShieldCheck, LockKeyhole, KeyRound, BadgeCheck, FileCheck2, FilePlus2, Fingerprint, ScanSearch,
  Users, Hospital, ArrowRight, CheckCircle2, ChevronDown, Menu, X, UploadCloud, Eye, Activity,
} from 'lucide-react'
import './landing.css'

// Adds a gentle fade-up the first time a section scrolls into view.
function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) { setShown(true); return }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`reveal ${shown ? 'in-view' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>
}

const FEATURES = [
  { icon: LockKeyhole, title: 'Encrypted before it is stored', text: 'Every report is sealed with AES-256-GCM using a fresh key. Only ciphertext ever reaches the database or disk.' },
  { icon: KeyRound, title: 'You hold the key', text: 'Your private key is created in your browser and never sent to the server. Not even administrators can read your reports.' },
  { icon: BadgeCheck, title: 'Proof it is authentic', text: 'The hospital digitally signs each report. Your browser verifies the signature before opening it, so tampering is caught.' },
  { icon: FilePlus2, title: 'Create or upload reports', text: 'Laboratory staff enter results with ready-made test templates, or upload an existing PDF. Out-of-range values are flagged automatically.' },
  { icon: Fingerprint, title: 'Two-factor sign-in', text: 'Add an authenticator app for a second layer of protection on any account, plus automatic sign-out when you are idle.' },
  { icon: ScanSearch, title: 'A full audit trail', text: 'Sign-ins, uploads and report access are recorded. Administrators can search, filter and export the log.' },
]

const STEPS = [
  { icon: Users, title: 'Register & create your key', text: 'Patients sign up and generate a private key file in their browser, protected by a passphrase only they know.' },
  { icon: FilePlus2, title: 'The lab prepares your report', text: 'Staff enter your results or upload a PDF. SecureLab builds the report and flags anything outside the reference range.' },
  { icon: LockKeyhole, title: 'Encrypted and signed', text: 'The report is locked with AES-256 and the key is wrapped for you with RSA. The hospital signs it as genuine.' },
  { icon: Eye, title: 'Unlock, verify, read', text: 'You unlock your key file, and your browser decrypts the report and checks its signature before showing it.' },
]

const ROLES = [
  { icon: Users, name: 'Patients', points: ['Create your private encryption key once', 'Search, sort and download your reports', 'Every report is verified before it opens'] },
  { icon: Hospital, name: 'Laboratory staff', points: ['Create reports from test templates', 'Upload PDFs for registered patients', 'Track and manage what you have sent'] },
  { icon: Activity, name: 'Administrators', points: ['Create staff accounts and manage access', 'Deactivate accounts instantly', 'Review and export the security audit trail'] },
]

const FAQ = [
  ['Can the hospital or an administrator read my reports?', 'No. Reports are encrypted for your personal key, which stays in your browser. Staff can upload a report for you but cannot open it afterwards.'],
  ['What happens if I lose my key file or passphrase?', 'Your reports cannot be recovered, because nobody else holds a copy of your key. Keep the key file somewhere safe and remember your passphrase.'],
  ['How do I know a report was not changed?', 'Each report carries a digital signature from the hospital and a SHA-256 fingerprint. Your browser checks both, and refuses to open the report if either fails.'],
  ['Is this ready for real patient data?', 'No. SecureLab is an academic prototype built for a Cryptography & Network Security project. It has not had a security audit, so please use synthetic data only.'],
]

export default function Landing({ onSignIn, onRegister }) {
  const [menu, setMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const close = () => setMenu(false)

  return (
    <div className="landing">
      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-container lp-nav-inner">
          <a className="lp-brand" href="#top" onClick={close}><span className="lp-brand-mark"><ShieldCheck size={20} /></span>SecureLab</a>
          <nav className={`lp-links ${menu ? 'open' : ''}`} aria-label="Primary">
            <a href="#features" onClick={close}>Features</a>
            <a href="#how" onClick={close}>How it works</a>
            <a href="#roles" onClick={close}>Who it is for</a>
            <a href="#faq" onClick={close}>FAQ</a>
            <div className="lp-links-cta"><button className="lp-btn lp-btn-ghost" onClick={onSignIn}>Sign in</button><button className="lp-btn lp-btn-primary" onClick={onRegister}>Get started</button></div>
          </nav>
          <button className="lp-menu-toggle" aria-label={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu(!menu)}>{menu ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </header>

      <section className="lp-hero" id="top">
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-pill"><span className="lp-dot" /> Encrypted hospital lab reports</span>
            <h1>Your lab results.<br /><em>Private by design.</em></h1>
            <p>SecureLab delivers laboratory reports end to end: encrypted in the lab, readable only by you, and digitally signed so you can trust every value.</p>
            <div className="lp-hero-actions">
              <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={onRegister}>Create patient account <ArrowRight size={18} /></button>
              <button className="lp-btn lp-btn-glass lp-btn-lg" onClick={onSignIn}>Sign in</button>
            </div>
            <ul className="lp-hero-points">
              <li><CheckCircle2 size={16} /> AES-256-GCM encryption</li>
              <li><CheckCircle2 size={16} /> Keys stay in your browser</li>
              <li><CheckCircle2 size={16} /> Signature-verified reports</li>
            </ul>
          </div>

          <div className="lp-hero-visual" aria-hidden="true">
            <div className="lp-report-card">
              <div className="lp-report-head"><div><small>SecureLab Diagnostics</small><strong>Complete Blood Count</strong></div><span className="lp-chip lp-chip-green"><LockKeyhole size={12} /> Encrypted</span></div>
              <div className="lp-report-meta"><div><small>Patient</small>Asha Verma</div><div><small>Collected</small>02 Nov 2026</div></div>
              <table>
                <thead><tr><th>Test</th><th>Result</th><th>Range</th><th /></tr></thead>
                <tbody>
                  <tr><td>Hemoglobin</td><td><b>13.8</b> g/dL</td><td>12 – 16</td><td><span className="lp-flag ok">NORMAL</span></td></tr>
                  <tr><td>WBC count</td><td><b>7.2</b> ×10³/µL</td><td>4 – 11</td><td><span className="lp-flag ok">NORMAL</span></td></tr>
                  <tr className="is-alert"><td>Platelets</td><td><b>412</b> ×10³/µL</td><td>150 – 400</td><td><span className="lp-flag high">HIGH</span></td></tr>
                </tbody>
              </table>
            </div>
            <div className="lp-float lp-float-a"><BadgeCheck size={18} /><div><strong>Signature verified</strong><small>Hospital RSA-PSS</small></div></div>
            <div className="lp-float lp-float-b"><KeyRound size={18} /><div><strong>Your key, your reports</strong><small>Never leaves your device</small></div></div>
          </div>
        </div>
      </section>

      <section className="lp-trust" aria-label="Security technologies">
        <div className="lp-container lp-trust-inner">
          <span>Built on proven cryptography</span>
          <ul><li>AES-256-GCM</li><li>RSA-OAEP</li><li>RSA-PSS signatures</li><li>SHA-256</li><li>PBKDF2</li><li>TOTP 2FA</li></ul>
        </div>
      </section>

      <section className="lp-section" id="features">
        <div className="lp-container">
          <Reveal className="lp-section-head"><span className="lp-eyebrow">FEATURES</span><h2>Everything a secure lab portal needs</h2><p>Privacy is not an add-on. It is how SecureLab is built, from the first upload to the moment you open your report.</p></Reveal>
          <div className="lp-feature-grid">
            {FEATURES.map((f, i) => <Reveal key={f.title} delay={i * 70} className="lp-feature"><div className="lp-icon"><f.icon size={22} /></div><h3>{f.title}</h3><p>{f.text}</p></Reveal>)}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-tint" id="how">
        <div className="lp-container">
          <Reveal className="lp-section-head"><span className="lp-eyebrow">HOW IT WORKS</span><h2>From the lab bench to your screen</h2><p>Four steps, and at no point can anyone but you read your report.</p></Reveal>
          <div className="lp-steps">
            {STEPS.map((s, i) => <Reveal key={s.title} delay={i * 90} className="lp-step"><div><div className="lp-step-top"><span className="lp-step-num">{i + 1}</span><div className="lp-icon lp-icon-sm"><s.icon size={18} /></div></div><h3>{s.title}</h3><p>{s.text}</p></div></Reveal>)}
          </div>
        </div>
      </section>

      <section className="lp-section" id="roles">
        <div className="lp-container">
          <Reveal className="lp-section-head"><span className="lp-eyebrow">WHO IT IS FOR</span><h2>A tailored workspace for every role</h2><p>Each account sees only what it needs, with its own colours and tools.</p></Reveal>
          <div className="lp-role-grid">
            {ROLES.map((r, i) => <Reveal key={r.name} delay={i * 90} className={`lp-role lp-role-${i}`}><div className="lp-icon"><r.icon size={22} /></div><h3>{r.name}</h3><ul>{r.points.map((p) => <li key={p}><CheckCircle2 size={16} />{p}</li>)}</ul><button className="lp-link-btn" onClick={onSignIn}>Sign in as {r.name.toLowerCase().replace(/s$/, '')} <ArrowRight size={15} /></button></Reveal>)}
          </div>
        </div>
      </section>

      <section className="lp-security">
        <div className="lp-container lp-security-inner">
          <Reveal className="lp-security-copy"><span className="lp-eyebrow lp-eyebrow-light">ZERO-TRUST BY DESIGN</span><h2>Even we cannot read your reports</h2><p>Your private key is generated in your browser and locked with your passphrase. The server stores only ciphertext, so a database leak exposes nothing readable.</p>
            <ul className="lp-checks"><li><CheckCircle2 size={18} /> Private keys never reach the server</li><li><CheckCircle2 size={18} /> Tampering is detected before a report opens</li><li><CheckCircle2 size={18} /> Deactivated accounts lose access immediately</li></ul></Reveal>
          <Reveal delay={120} className="lp-security-card"><div className="lp-flow"><div><UploadCloud size={18} /><span>Lab report</span></div><i /><div><LockKeyhole size={18} /><span>AES-256-GCM</span></div><i /><div><KeyRound size={18} /><span>Wrapped for you</span></div><i /><div><FileCheck2 size={18} /><span>Verified &amp; opened</span></div></div></Reveal>
        </div>
      </section>

      <section className="lp-section" id="faq">
        <div className="lp-container lp-faq-wrap">
          <Reveal className="lp-section-head"><span className="lp-eyebrow">FAQ</span><h2>Questions, answered</h2></Reveal>
          <div className="lp-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}<ChevronDown size={18} /></summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="lp-cta">
        <Reveal className="lp-container lp-cta-inner"><h2>Ready to see your results, privately?</h2><p>Create a patient account in under a minute, or sign in to your workspace.</p>
          <div className="lp-hero-actions lp-center"><button className="lp-btn lp-btn-primary lp-btn-lg" onClick={onRegister}>Get started <ArrowRight size={18} /></button><button className="lp-btn lp-btn-glass lp-btn-lg" onClick={onSignIn}>Sign in</button></div></Reveal>
      </section>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div><a className="lp-brand lp-brand-dark" href="#top"><span className="lp-brand-mark"><ShieldCheck size={18} /></span>SecureLab</a><p>RSA + AES encrypted hospital lab report portal.</p></div>
          <p className="lp-disclaimer">Academic prototype for a Cryptography &amp; Network Security project. Not audited and not for clinical use. Please use synthetic data only.</p>
        </div>
      </footer>
    </div>
  )
}
