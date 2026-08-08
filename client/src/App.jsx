import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  ExternalLink,
  FileText,
  HeartPulse,
  Home,
  Link as LinkIcon,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router";
import { bypassLink, getCurrentUser, logout } from "./api.js";
import { describeBypassError, getDestination } from "./resultUtils.js";

const countdownFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const policyDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric"
});
const policyLastUpdated = new Date("2026-06-21T00:00:00Z");

const supportedSites = [
  "Linkvertise", "bstlar.com", "Cutty", "shrinkme.click", "Lootlinks", "AdFoc.us",
  "Boost.ink", "BoostFusedGT", "leasurepartment.xyz", "LetsBoost", "mboost.me",
  "Rekonise", "shorte.st", "Sub2Unlock.com", "Sub2Unlock.net", "v.gd", "dragonslayer",
  "egirls.wtf", "tinyurl.com", "bit.ly", "is.gd", "rebrand.ly", "empebau.eu",
  "socialwolvez.com", "sub1s.com", "tinylink.onl", "google-url", "Justpaste.it Redirect",
  "SubFinal", "Location Redirect", "Ad-Maven", "BaseResolver", "ParamsResolver"
];

const faqItems = [
  ["Which Ad-Link Sites Are Supported?", "The service supports Linkvertise and the other providers listed above. Support can change when providers update their flows."],
  ["Are Bypasses Restricted?", "Authenticated users can submit links subject to fair-use and upstream rate limits."],
  ["How Does It Work?", "Paste a supported public link. The server validates it, sends it to the bypass provider, and returns the final destination or text result."],
  ["Do You Support Paste Results?", "Yes. When a provider returns text instead of a destination URL, it is displayed as a copyable result."],
  ["What If I Get an Error?", "The result panel distinguishes unsupported links, rate limits, service outages, timeouts, and expired sessions so you know what to do next."],
  ["Do You Use Advertising Cookies?", "No. The app uses essential first-party authentication cookies and local browser storage for theme and notice preferences."]
];

function signInWithHackClub() {
  window.location.assign("/auth/hackclub");
}

function signInWithAuthometry() {
  window.location.assign("/auth/authometry");
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [theme, setTheme] = useState(initialTheme);
  const menuButtonRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setSessionError("Your session could not be checked. You can retry by reloading the page.");
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme-preference", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#181b22" : "#f5f7fb");
  }, [theme]);

  useEffect(() => {
    let animationFrame;
    if (location.hash) {
      animationFrame = window.requestAnimationFrame(() => {
        const target = document.getElementById(location.hash.slice(1));
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      });
    } else {
      window.scrollTo({ top: 0 });
    }
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [location.hash, location.pathname]);

  async function handleLogout() {
    try {
      await logout();
      setUser(null);
      setMenuOpen(false);
    } catch {
      setSessionError("Logout failed. Please try again.");
    }
  }

  const displayName = user?.name || user?.email || "Hack Club user";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to Main Content</a>
      <Header
        authLoading={authLoading}
        displayName={displayName}
        menuButtonRef={menuButtonRef}
        menuOpen={menuOpen}
        onLogout={handleLogout}
        onMenuToggle={() => setMenuOpen((open) => !open)}
        onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        theme={theme}
        user={user}
      />
      {menuOpen ? (
        <SideNav
          displayName={displayName}
          menuButtonRef={menuButtonRef}
          onClose={() => setMenuOpen(false)}
          onLogout={handleLogout}
          user={user}
        />
      ) : null}

      {sessionError ? <div className="global-alert" role="alert">{sessionError}</div> : null}

      <Routes>
        <Route
          path="/"
          element={<HomePage authLoading={authLoading} onAuthExpired={() => setUser(null)} user={user} />}
        />
        <Route path="/privacy" element={<PolicyPage type="privacy" />} />
        <Route path="/terms" element={<PolicyPage type="terms" />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>

      <StorageNotice />
    </div>
  );
}

function Header({ authLoading, displayName, menuButtonRef, menuOpen, onLogout, onMenuToggle, onThemeToggle, theme, user }) {
  return (
    <header className="top-header">
      <Link className="brand" to="/" aria-label="bypass.city home" translate="no">
        <img className="brand-logo" src="/images/logo-long.svg" alt="bypass.city" fetchPriority="high" height="50" width="207" />
      </Link>
      <div className="header-actions">
        {user ? (
          <div className="user-chip" title={displayName}>
            <UserRound size={15} aria-hidden="true" />
            <span>{displayName}</span>
            <button aria-label="Log out" onClick={onLogout} type="button"><LogOut size={15} /></button>
          </div>
        ) : (
          <button className="icon-button signin-icon" disabled={authLoading} onClick={signInWithAuthometry} aria-label="Sign in with Authometry" type="button">
            <UserRound size={19} />
          </button>
        )}
        <button className="icon-button theme-button" onClick={onThemeToggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} type="button">
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button
          ref={menuButtonRef}
          className="icon-button menu-button"
          onClick={onMenuToggle}
          aria-controls="site-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          type="button"
        >
          {menuOpen ? <X size={27} /> : <Menu size={27} />}
        </button>
      </div>
    </header>
  );
}

function SideNav({ displayName, menuButtonRef, onClose, onLogout, user }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const panel = panelRef.current;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.querySelector("button, a")?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll('a[href], button:not([disabled])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      menuButton?.focus();
    };
  }, [menuButtonRef, onClose]);

  return (
    <div className="nav-layer">
      <button className="nav-scrim" onClick={onClose} aria-label="Close navigation" type="button" />
      <aside ref={panelRef} className="side-nav" id="site-navigation" role="dialog" aria-modal="true" aria-label="Site navigation">
        <div className="nav-heading">
          <strong>Navigation</strong>
          <button className="icon-button" onClick={onClose} aria-label="Close navigation" type="button"><X size={22} /></button>
        </div>
        {user ? <div className="mobile-account"><UserRound size={18} /><span>{displayName}</span></div> : null}
        <nav>
          <Link className="nav-card" to="/" onClick={onClose}><Home size={18} /><span><strong>Home</strong><small>Bypass a link</small></span></Link>
          <Link className="nav-card" to="/#supported" onClick={onClose}><LinkIcon size={18} /><span><strong>Supported Websites</strong><small>Browse supported providers</small></span></Link>
          <Link className="nav-card" to="/privacy" onClick={onClose}><ShieldCheck size={18} /><span><strong>Privacy</strong><small>How data is handled</small></span></Link>
          <Link className="nav-card" to="/terms" onClick={onClose}><FileText size={18} /><span><strong>Terms</strong><small>Rules for using the service</small></span></Link>
        </nav>
        {user ? (
          <button className="nav-logout" onClick={onLogout} type="button"><LogOut size={18} />Log Out</button>
        ) : (
          <div className="nav-login-options">
            <button className="nav-login" onClick={signInWithAuthometry} type="button"><ShieldCheck size={18} />Continue with Authometry</button>
            <button className="nav-login nav-login-secondary" onClick={signInWithHackClub} type="button"><UserRound size={18} />Continue with Hack Club</button>
          </div>
        )}
      </aside>
    </div>
  );
}

function HomePage({ authLoading, onAuthExpired, user }) {
  const [url, setUrl] = useState("");
  const [autoRedirect, setAutoRedirect] = useState(false);
  const [status, setStatus] = useState({ type: "idle", message: "", result: "" });
  const inputRef = useRef(null);

  useEffect(() => {
    if (status.type === "error") inputRef.current?.focus();
  }, [status.message, status.type]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user) {
      signInWithAuthometry();
      return;
    }
    setStatus({ type: "loading", message: "Bypassing link…", result: "" });
    try {
      const result = await bypassLink({ url });
      setStatus({ type: "success", message: "Your result is ready.", result });
    } catch (error) {
      const details = describeBypassError(error);
      if (details.code === "unauthorized") onAuthExpired();
      setStatus({ type: "error", message: details.message, result: "", code: details.code });
    }
  }

  async function handleClipboard() {
    if (!navigator.clipboard?.readText) {
      setStatus({ type: "error", message: "Clipboard access is not available in this browser.", result: "" });
      return;
    }
    try {
      setUrl((await navigator.clipboard.readText()).trim());
    } catch {
      setStatus({ type: "error", message: "Clipboard permission was denied.", result: "" });
    }
  }

  return (
    <main className="page-main" id="main-content">
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-glow" aria-hidden="true" />
        <p className="eyebrow">Fast, clear, and account-protected</p>
        <h1 id="hero-title">Bypass <span>Supported Links</span></h1>
        <p className="hero-copy">Paste a public ad-link and get its destination without the unnecessary steps.</p>
        <form className="bypass-form" onSubmit={handleSubmit}>
          <label htmlFor="bypass-url">Link to Bypass</label>
          <input
            ref={inputRef}
            id="bypass-url"
            aria-describedby={status.type === "error" ? "bypass-url-error" : undefined}
            aria-invalid={status.type === "error"}
            autoComplete="off"
            inputMode="url"
            name="url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://linkvertise.com/…"
            required
            type="url"
            value={url}
          />
          <button className="primary-action" disabled={authLoading || status.type === "loading"} type="submit">
            {status.type === "loading" ? "Working…" : user ? "Bypass Link" : "Continue with Authometry"}
          </button>
          {status.type === "error" ? <p className="field-error" id="bypass-url-error" role="alert">{status.message}</p> : null}
        </form>
        {!user && !authLoading ? (
          <button className="alternate-login" onClick={signInWithHackClub} type="button">
            <UserRound size={15} aria-hidden="true" />Continue with Hack Club instead
          </button>
        ) : null}
        {status.type === "loading" || status.type === "success" ? <Result key={`${status.type}-${status.result}`} autoRedirect={autoRedirect} status={status} /> : null}
        <div className="hero-controls">
          <button className="text-action" onClick={handleClipboard} type="button"><Clipboard size={16} />Paste from Clipboard</button>
          <label className="toggle-row">
            <input checked={autoRedirect} name="auto-redirect" onChange={(event) => setAutoRedirect(event.target.checked)} type="checkbox" />
            <span className="toggle-track" aria-hidden="true" />
            Auto-redirect
          </label>
        </div>
        <button className="example-card" onClick={() => setUrl("https://linkvertise.com/48193/example")} type="button">
          <Sparkles size={18} aria-hidden="true" /><span><strong>Try an Example</strong><small>Fill the form with a sample Linkvertise URL.</small></span>
        </button>
      </section>

      <section className="feature-grid" id="supported" aria-label="Service features">
        <SupportedCard />
        <InfoCard icon={<HeartPulse size={40} />} title="Clear Status" text="Timeouts, rate limits, unsupported links, and expired sessions are reported separately." />
        <InfoCard icon={<BadgeCheck size={40} />} title="Safer by Default" text="Links are validated before processing, and private or local network destinations are rejected." />
      </section>
      <Faq />
    </main>
  );
}

function Result({ autoRedirect, status }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const destination = getDestination(status.result);

  useEffect(() => {
    if (!autoRedirect || !destination || cancelled || status.type !== "success") return undefined;
    const interval = window.setInterval(() => setCountdown((value) => Math.max(1, value - 1)), 1_000);
    const timeout = window.setTimeout(() => window.location.assign(status.result), 5_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [autoRedirect, cancelled, destination, status.result, status.type]);

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(status.result);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopied(false);
      setCopyError(destination ? "Could not copy the result. Use the Open Destination link instead." : "Could not copy the result. Select the text above and copy it manually.");
    }
  }

  const role = status.type === "error" ? "alert" : "status";
  return (
    <div className={`result-card ${status.type}`} role={role} aria-live={status.type === "error" ? "assertive" : "polite"}>
      <div className="result-heading"><strong>{status.type === "success" ? "Result Ready" : status.type === "error" ? "Could Not Bypass Link" : "Working"}</strong>{status.type === "loading" ? <span className="spinner" aria-hidden="true" /> : null}</div>
      <span>{status.message}</span>
      {status.type === "success" ? (
        <>
          {destination ? <div className="destination" translate="no"><small>Destination</small><strong>{destination.hostname}</strong><span>{destination.pathname}</span></div> : <pre className="text-result" translate="no">{status.result}</pre>}
          <div className="result-actions">
            <button onClick={copyResult} type="button"><Copy size={16} />{copied ? "Copied" : "Copy Result"}</button>
            {destination ? <a href={status.result} rel="noreferrer"><ExternalLink size={16} />Open Destination</a> : null}
          </div>
          {copyError ? <span className="copy-feedback">{copyError}</span> : null}
          {autoRedirect && destination ? (
            <div className="redirect-notice">
              {cancelled ? <span>Auto-redirect cancelled.</span> : <span>Opening in <span className="countdown-number">{countdownFormatter.format(countdown)}</span> seconds…</span>}
              {!cancelled ? <button onClick={() => setCancelled(true)} type="button">Cancel</button> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SupportedCard() {
  return <article className="feature-card supported-card"><div className="card-heading"><LinkIcon size={40} /><h2>Supported Websites</h2></div><ul>{supportedSites.map((site) => <li key={site}><BadgeCheck size={19} /><span translate="no">{site}</span></li>)}</ul></article>;
}

function InfoCard({ icon, title, text }) {
  return <article className="feature-card info-card"><div className="info-icon">{icon}</div><h2>{title}</h2><p>{text}</p></article>;
}

function Faq() {
  const [searchParams, setSearchParams] = useSearchParams();
  const faqParam = searchParams.get("faq");
  const parsedIndex = Number.parseInt(faqParam, 10);
  const openIndex = faqParam === null ? 0 : faqParam === "none" ? -1 : Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < faqItems.length ? parsedIndex : -1;

  function toggleFaq(index) {
    const nextParams = new window.URLSearchParams(searchParams);
    nextParams.set("faq", openIndex === index ? "none" : String(index));
    setSearchParams(nextParams, { preventScrollReset: true, replace: true });
  }

  return (
    <section className="faq-section" aria-labelledby="faq-heading">
      <h2 id="faq-heading">Frequently Asked Questions</h2>
      <div className="faq-list">{faqItems.map(([question, answer], index) => {
        const open = openIndex === index;
        const answerId = `faq-answer-${index}`;
        return <div className="faq-item" key={question}><button aria-controls={answerId} aria-expanded={open} onClick={() => toggleFaq(index)} type="button"><span>{question}</span>{open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>{open ? <div className="faq-answer" id={answerId}><p>{answer}</p></div> : null}</div>;
      })}</div>
    </section>
  );
}

function PolicyPage({ type }) {
  const privacy = type === "privacy";
  return (
    <main className="policy-page" id="main-content">
      <p className="eyebrow">Last updated <time dateTime="2026-06-21">{policyDateFormatter.format(policyLastUpdated)}</time></p>
      <h1>{privacy ? "Privacy Policy" : "Terms of Service"}</h1>
      <p className="policy-lead">{privacy ? "This page explains the limited data used to operate bypass-links." : "These terms describe the acceptable use of bypass-links."}</p>
      {privacy ? <PrivacyContent /> : <TermsContent />}
      <Link className="back-link" to="/"><Home size={17} />Back to the Bypasser</Link>
    </main>
  );
}

function PrivacyContent() {
  return <div className="policy-sections"><section><h2>Data You Provide</h2><p>Authometry or Hack Club supplies your account identifier, name, and email during sign-in. Submitted URLs are processed to provide the requested result.</p></section><section><h2>Storage</h2><p>Essential first-party cookies maintain your session. Local storage remembers theme and notice preferences. Refresh sessions expire after 30 days and can be revoked when you log out.</p></section><section><h2>Service Providers</h2><p>Authometry and Hack Club provide authentication, and bypass.vip processes submitted links. Telegram and Discord are used only for their configured bot and operational notification features.</p></section><section><h2>Operational Logs</h2><p>Logs contain request paths, timing, status, and sanitized URL metadata. OAuth codes, query strings, message text, credentials, and token values are not intentionally logged.</p></section></div>;
}

function TermsContent() {
  return <div className="policy-sections"><section><h2>Acceptable Use</h2><p>Use the service only for links you are legally permitted to access. Do not use it to attack systems, evade access controls, distribute malware, or interfere with other users.</p></section><section><h2>Availability</h2><p>The service is provided as-is. Supported providers and results may change, and requests are subject to fair-use and upstream limits.</p></section><section><h2>Accounts</h2><p>You are responsible for activity performed through your authenticated session. Log out on shared devices and report suspected account misuse through the project owner.</p></section><section><h2>Enforcement</h2><p>Access may be limited or revoked when necessary to protect the service, its providers, or other users.</p></section></div>;
}

function StorageNotice() {
  const [visible, setVisible] = useState(() => localStorage.getItem("storage-notice-dismissed") !== "yes");
  if (!visible) return null;
  function dismiss() {
    localStorage.setItem("storage-notice-dismissed", "yes");
    setVisible(false);
  }
  return <aside className="storage-notice" aria-label="Storage notice"><p>Essential first-party cookies support your sign-in, and local storage remembers your preferences. <Link to="/privacy">Privacy Details</Link></p><button onClick={dismiss} type="button">Dismiss</button></aside>;
}

function initialTheme() {
  const stored = localStorage.getItem("theme-preference");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
