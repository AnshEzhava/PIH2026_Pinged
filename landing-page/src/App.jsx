import { useState, useEffect } from 'react'
import './App.css'

const STEPS = [
  {
    title: 'Search for a Disease',
    desc: 'Type any disease name — from Alzheimer\'s to Type 2 Diabetes. Choose from 22+ pre-warmed conditions or search freely.',
  },
  {
    title: 'AI Ranks Candidates',
    desc: 'The XGBoost pipeline scores thousands of known drugs against the disease\'s gene targets, surfacing the best hits.',
  },
  {
    title: 'Explore Drug Profiles',
    desc: 'Tap any result to view the full drug profile — molecular structure, pharmacokinetics, indications, and interaction networks.',
  },
  {
    title: 'Chat with Gemini AI',
    desc: 'Ask the integrated chatbot to explain mechanisms, compare drugs, or summarise relevant literature.',
  },
]

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function PulseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function SearchScreen() {
  return (
    <>
      <div className="phone-header">
        <h4>Search Diseases</h4>
        <p>Find treatment candidates</p>
      </div>
      <div className="phone-search">
        <SearchIcon />
        Alzheimer's Disease
        <span className="search-cursor" />
      </div>
      <div className="screen-label">Popular Diseases</div>
      {['Alzheimer\'s Disease', 'Type 2 Diabetes', 'Breast Cancer', 'Parkinson\'s Disease', 'Asthma'].map((d) => (
        <div className="disease-row" key={d}>
          <span className="disease-dot" />
          {d}
        </div>
      ))}
    </>
  )
}

function ResultsScreen() {
  const drugs = [
    { name: 'Donepezil', score: 92, genes: 14 },
    { name: 'Memantine', score: 78, genes: 9 },
    { name: 'Rivastigmine', score: 65, genes: 7 },
  ]
  return (
    <>
      <div className="phone-header">
        <h4>Drug Alternatives</h4>
        <p>Alzheimer's Disease · Ranked by potential</p>
      </div>
      {drugs.map((drug) => (
        <div className="drug-item" key={drug.name}>
          <div className="drug-item-name">{drug.name}</div>
          <div className="drug-item-bar">
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${drug.score}%` }} />
            </div>
            <span className="drug-item-score">{drug.score}%</span>
          </div>
          <div className="drug-item-meta">{drug.genes} gene interactions</div>
        </div>
      ))}
    </>
  )
}

function DetailScreen() {
  return (
    <>
      <div className="phone-header">
        <h4>Donepezil</h4>
        <p>Alzheimer's Disease · Score: 92%</p>
      </div>
      <div className="detail-card">
        <div className="detail-card-title">Drug-Disease Network</div>
        <div className="network-mini">
          <svg viewBox="0 0 200 100" className="network-svg">
            <line x1="100" y1="50" x2="40" y2="25" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" />
            <line x1="100" y1="50" x2="160" y2="30" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" />
            <line x1="100" y1="50" x2="50" y2="75" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" />
            <line x1="100" y1="50" x2="155" y2="78" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" />
            <line x1="40" y1="25" x2="70" y2="15" stroke="var(--border)" strokeWidth="1" opacity="0.5" />
            <line x1="160" y1="30" x2="180" y2="55" stroke="var(--border)" strokeWidth="1" opacity="0.5" />
            <circle cx="100" cy="50" r="8" fill="var(--accent)" />
            <circle cx="40" cy="25" r="5" fill="var(--accent)" opacity="0.6" />
            <circle cx="160" cy="30" r="5" fill="var(--accent)" opacity="0.6" />
            <circle cx="50" cy="75" r="5" fill="var(--accent)" opacity="0.6" />
            <circle cx="155" cy="78" r="5" fill="var(--accent)" opacity="0.6" />
            <circle cx="70" cy="15" r="3.5" fill="var(--text-secondary)" opacity="0.4" />
            <circle cx="180" cy="55" r="3.5" fill="var(--text-secondary)" opacity="0.4" />
          </svg>
        </div>
      </div>
      <div className="detail-card">
        <div className="detail-card-title">Molecular Structure</div>
        <div className="molecule-placeholder">C₂₄H₂₉NO₃</div>
      </div>
    </>
  )
}

function ChatScreen() {
  return (
    <>
      <div className="phone-header">
        <h4>AI Assistant</h4>
        <p>Gemini · Donepezil</p>
      </div>
      <div className="chat-bubble chat-user">How does Donepezil work for Alzheimer&apos;s?</div>
      <div className="chat-bubble chat-ai">
        Donepezil is a reversible acetylcholinesterase inhibitor. It increases acetylcholine levels in the brain, improving neural signal transmission in patients with cognitive decline.
      </div>
      <div className="chat-bubble chat-user">What are the side effects?</div>
      <div className="chat-bubble chat-ai">
        Common side effects include nausea, insomnia, and muscle cramps. These are generally mild and transient.
      </div>
    </>
  )
}

const PHONE_SCREENS = [SearchScreen, ResultsScreen, DetailScreen, ChatScreen]
const SCREEN_LABELS = ['Search', 'Results', 'Details', 'Chat']

function PhoneMockup() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % 4)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const ActiveScreen = PHONE_SCREENS[active]

  return (
    <div className="iphone">
      <div className="iphone-screen">
        <div className="iphone-statusbar">
          <span className="status-time">9:41</span>
          <div className="dynamic-island" />
          <div className="status-icons">
            <svg width="14" height="10" viewBox="0 0 14 10" fill="var(--text)"><path d="M0 5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-4Zm3-2a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-6Zm3-2a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-8Zm3-1.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v9.5a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5V0Z" /></svg>
            <svg width="16" height="10" viewBox="0 0 16 10" fill="var(--text)"><rect x="0" y="1" width="13" height="8" rx="1.5" stroke="var(--text)" strokeWidth="1" fill="none" /><rect x="1.5" y="2.5" width="9" height="5" rx="0.5" fill="var(--text)" /><path d="M14 3.5v3a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1Z" fill="var(--text)" /></svg>
          </div>
        </div>
        <div className="phone-content" key={active}>
          <ActiveScreen />
        </div>
        <div className="phone-tabs">
          {SCREEN_LABELS.map((label, i) => (
            <button
              key={label}
              className={`phone-tab ${i === active ? 'phone-tab-active' : ''}`}
              onClick={() => setActive(i)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="iphone-home-indicator" />
      </div>
    </div>
  )
}

function App() {
  return (
    <>
      <nav>
        <a href="#" className="nav-brand">
          <PulseIcon />
          Pinged
        </a>
        <ul className="nav-links">

          <li><a href="#how-it-works">How It Works</a></li>
          <li><a href="/pinged.apk" className="btn btn-primary" download><DownloadIcon /> Download APK</a></li>
        </ul>
      </nav>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-content">
            <div className="hero-label">
              <span className="hero-label-dot" />
              Medical Research Tool
            </div>
            <h1>
              Drug Repurposing,<br />
              <span>Powered by AI</span>
            </h1>
            <p className="hero-desc">
              Pinged uses machine learning and gene interaction networks to discover
              new therapeutic uses for existing drugs — accelerating treatment
              discovery for over 22 diseases.
            </p>
            <div className="hero-buttons">
              <a href="/pinged.apk" className="btn btn-download" download>
                <DownloadIcon />
                Download Free APK
              </a>
              <a href="#how-it-works" className="btn btn-outline">
                Learn More
              </a>
            </div>
            <div className="hero-metrics">
              <div className="metric">
                <h3>25000+</h3>
                <p>Diseases Covered</p>
              </div>
              <div className="metric">
                <h3>XGBoost</h3>
                <p>ML Engine</p>
              </div>
              <div className="metric">
                <h3>Free</h3>
                <p>Open Access</p>
              </div>
            </div>
          </div>
          <PhoneMockup />
        </div>
      </section>


      <section className="steps" id="how-it-works">
        <div className="steps-inner">
          <p className="section-eyebrow">How It Works</p>
          <h2 className="section-heading">Disease to Drug Candidates in Seconds</h2>
          <div className="step-list">
            {STEPS.map((s, i) => (
              <div className="step" key={i}>
                <div className="step-number">{String(i + 1).padStart(2, '0')}</div>
                <div className="step-body">
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta" id="download">
        <div className="cta-card">
          <div className="cta-icon">💊</div>
          <h2>Download Pinged</h2>
          <p>
            Install the Android APK and explore AI-powered drug repurposing
            research from your phone — completely free.
          </p>
          <a href="/pinged.apk" className="btn btn-download" download>
            <DownloadIcon />
            Download APK for Android
          </a>
          <div className="cta-meta">
            <span><CheckIcon /> Free to install</span>
            <span><CheckIcon /> Android 8.0+</span>
            <span><CheckIcon /> No account needed</span>
          </div>
          <div className="disclaimer">
            <strong>⚠ Medical Disclaimer:</strong> Pinged is intended for research
            and educational purposes only. Predictions are based on computational
            models and have not been clinically validated. This tool does not
            constitute medical advice. Always consult a qualified healthcare
            professional before making clinical decisions.
          </div>
        </div>
      </section>

      <footer>
        <span className="footer-brand">Pinged</span>
        <span>© 2026 PIH2026 · For research use only</span>
      </footer>
    </>
  )
}

export default App
