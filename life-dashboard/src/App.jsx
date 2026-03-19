import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine
} from "recharts";

// ─── Storage (localStorage wrapper) ─────────────────────────────────────────

const STORAGE_KEY = "life-tracker-records";

const storage = {
  get() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      return true;
    } catch (e) {
      // localStorage can throw if storage quota is exceeded
      console.error("Storage write failed:", e);
      return false;
    }
  },
  delete() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  },
};

// ─── CSV Parsers ─────────────────────────────────────────────────────────────

function parseTimeHours(t) {
  if (!t) return 0;
  const clean = t.replace(/ AM| PM/g, "").trim();
  const parts = clean.split(":");
  return parseFloat(parts[0] || 0) + parseFloat(parts[1] || 0) / 60 + parseFloat(parts[2] || 0) / 3600;
}

function parseDuration(t) {
  if (!t) return 0;
  const parts = t.trim().split(":");
  return parseFloat(parts[0] || 0) + parseFloat(parts[1] || 0) / 60 + parseFloat(parts[2] || 0) / 3600;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim().replace(/^"|"$/g, ""); });
    const date = obj["Date"] || "";
    if (!date || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) return null;
    return {
      date,
      dow:          obj["Day of the week"] || "",
      sleep:        parseTimeHours(obj["Hours slept:"]),
      happiness:    parseInt(obj["Overall happiness rating:"]) || 0,
      productivity: parseInt(obj["Productivity rating:"]) || 0,
      stress:       parseInt(obj["Stress rating:"]) || 0,
      active:       parseInt(obj["Physical activity completed:"]) || 0,
      steps:        parseInt(obj["Step count:"]) || 0,
      water:        parseInt(obj["mL of water drank:"]) || 0,
      screentime:   parseDuration(obj["Phone screentime:"]),
      photo:        parseInt(obj["Did you take the daily picture?"]) || 0,
      leetcode:     parseInt(obj["Leetcode?"]) || 0,
      journal:      parseInt(obj["Did you journal today?"]) || 0,
      bed_made:     parseInt(obj["Did you make your bed?"]) || 0,
      social:       parseInt(obj["Did you upload to Social Media?"]) || 0,
      gaming:       parseDuration(obj["Time playing video games:"]),
      ppl:          ["Push", "Pull", "Legs", ""].includes(obj["PPL?"] || "") ? (obj["PPL?"] || "") : "",
      run:          parseFloat(obj["Run distance (x.xx miles)"]) || 0,
      gymTime:      parseDuration(obj["Time gymming:"]),
      energy:       parseInt(obj["Energy rating:"]) || 0,
      clarity:      parseInt(obj["Mental clarity rating:"]) || 0,
    };
  }).filter(d => d && d.happiness > 0);
}

function mergeRecords(existing, incoming) {
  const map = new Map();
  [...existing, ...incoming].forEach(d => map.set(d.date, d));
  return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// ─── Stats helpers ───────────────────────────────────────────────────────────
const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const pct = arr => arr.length ? Math.round(arr.filter(Boolean).length / arr.length * 100) : 0;
const diff = (a, b) => b === 0 ? null : Math.round(((a - b) / b) * 100);
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthKey(dateStr) {
  const [m, , y] = dateStr.split("/");
  return `${y}-${String(m).padStart(2, "0")}`;
}

function quarterKey(dateStr) {
  const [m, , y] = dateStr.split("/");
  return `${y}-Q${Math.ceil(parseInt(m) / 3)}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return `${MONTH_FULL[parseInt(m) - 1]} ${y}`;
}

function prevMonthKey(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function quarterLabel(key) {
  return key.replace("-", " ");
}

function prevQuarterKey(key) {
  const [y, q] = key.split("-Q").map(Number);
  return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
}

function generateInsights(data) {
  if (!data.length) return [];

  const insights = [];
  const fmtDate = d => {
    const [m, day] = d.date.split("/");
    return `${MONTH_FULL[parseInt(m) - 1]} ${day}`;
  };

  const happiest = data.reduce((a, b) => b.happiness > a.happiness ? b : a);
  const saddest = data.reduce((a, b) => b.happiness < a.happiness ? b : a);
  const mostSlept = data.reduce((a, b) => b.sleep > a.sleep ? b : a);
  const leastSlept = data.reduce((a, b) => b.sleep < a.sleep ? b : a);
  const mostSteps = data.reduce((a, b) => b.steps > a.steps ? b : a);
  const mostProd = data.reduce((a, b) => b.productivity > a.productivity ? b : a);

  insights.push({ icon: "😊", color: "#f5c842", text: `${fmtDate(happiest)} was your happiest day (${happiest.happiness}/6)` });
  if (saddest.happiness !== happiest.happiness) {
    insights.push({ icon: "😔", color: "#ff6b6b", text: `${fmtDate(saddest)} was your lowest mood day (${saddest.happiness}/6)` });
  }
  insights.push({ icon: "🌙", color: "#cc88ff", text: `Best sleep: ${fmtDate(mostSlept)} with ${mostSlept.sleep.toFixed(1)}h` });
  insights.push({ icon: "😴", color: "#ff6b6b", text: `Least sleep: ${fmtDate(leastSlept)} with ${leastSlept.sleep.toFixed(1)}h` });
  insights.push({ icon: "👟", color: "#4fd1c5", text: `Most steps: ${fmtDate(mostSteps)} with ${mostSteps.steps.toLocaleString()} steps` });
  insights.push({ icon: "💪", color: "#6bcb77", text: `Most productive: ${fmtDate(mostProd)} (${mostProd.productivity}/6)` });

  let maxActiveStreak = 0;
  let cur = 0;
  data.forEach(d => {
    cur = d.active ? cur + 1 : 0;
    maxActiveStreak = Math.max(maxActiveStreak, cur);
  });
  if (maxActiveStreak > 1) insights.push({ icon: "🏃", color: "#6bcb77", text: `Longest active streak: ${maxActiveStreak} days in a row` });

  const gymDays = data.filter(d => d.gymTime > 0).length;
  if (gymDays > 0) insights.push({ icon: "🏋️", color: "#ff6b6b", text: `Hit the gym ${gymDays} times — that's ${Math.round(gymDays / data.length * 100)}% of days` });

  const runTotal = data.reduce((a, d) => a + d.run, 0);
  if (runTotal > 0) insights.push({ icon: "🏃", color: "#6bcb77", text: `Ran ${runTotal.toFixed(1)} miles total` });

  const highStress = data.filter(d => d.stress >= 4).length;
  if (highStress > 0) insights.push({ icon: "😤", color: "#ff6b6b", text: `${highStress} high-stress day${highStress > 1 ? "s" : ""} (stress ≥ 4/6)` });

  const avgScreen = avg(data.map(d => d.screentime));
  insights.push({ icon: "📱", color: "#888899", text: `Average screen time: ${avgScreen.toFixed(1)}h/day` });

  const tenK = data.filter(d => d.steps >= 10000).length;
  if (tenK > 0) insights.push({ icon: "⭐", color: "#f5c842", text: `Hit 10k steps on ${tenK} day${tenK > 1 ? "s" : ""}` });

  const waterGoal = data.filter(d => d.water >= 2500).length;
  insights.push({ icon: "💧", color: "#4fd1c5", text: `Met hydration goal (2500mL) on ${waterGoal} of ${data.length} days` });

  return insights;
}

function generateComparisons(curr, prev) {
  if (!curr.length || !prev.length) return [];

  const metrics = [
    { key: "steps", label: "Daily steps", icon: "👟", fmt: v => Math.round(v).toLocaleString(), higherBetter: true },
    { key: "sleep", label: "Sleep per night", icon: "🌙", fmt: v => v.toFixed(1), higherBetter: true },
    { key: "happiness", label: "Mood", icon: "😊", fmt: v => v.toFixed(1) + "/6", higherBetter: true },
    { key: "energy", label: "Energy", icon: "⚡", fmt: v => v.toFixed(1) + "/6", higherBetter: true },
    { key: "stress", label: "Stress", icon: "😤", fmt: v => v.toFixed(1) + "/6", higherBetter: false },
    { key: "water", label: "Water intake", icon: "💧", fmt: v => Math.round(v).toLocaleString(), higherBetter: true },
    { key: "screentime", label: "Screen time", icon: "📱", fmt: v => v.toFixed(1), higherBetter: false },
    { key: "productivity", label: "Productivity", icon: "💼", fmt: v => v.toFixed(1) + "/6", higherBetter: true },
    { key: "active", label: "Active days", icon: "🏃", fmt: v => Math.round(v) + "%", higherBetter: true, isPct: true },
  ];

  return metrics.map(m => {
    const currVal = m.isPct ? pct(curr.map(d => d[m.key])) : avg(curr.map(d => d[m.key]).filter(v => v > 0 || m.key === "active"));
    const prevVal = m.isPct ? pct(prev.map(d => d[m.key])) : avg(prev.map(d => d[m.key]).filter(v => v > 0 || m.key === "active"));
    const change = diff(currVal, prevVal);
    const better = change === null ? null : (m.higherBetter ? change > 0 : change < 0);
    return { ...m, currVal, prevVal, change, better };
  });
}

// ─── Design tokens ───────────────────────────────────────────────────────────
const P = {
  bg: "#0a0a0f", panel: "#111118", border: "#1e1e2e",
  accent: "#cc88ff", gold: "#f5c842", teal: "#4fd1c5",
  coral: "#ff6b6b", sage: "#6bcb77", muted: "#555570",
  text: "#e2e2f0", subtext: "#888899",
};

const TABS = ["Overview", "Sleep", "Wellness", "Habits", "Fitness", "Period"];

// ─── Sub-components ──────────────────────────────────────────────────────────

const Tip = ({ active, payload, label, unit = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a1a2e", border: "1px solid #2a2a4e", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: P.text }}>
      <div style={{ color: P.subtext, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || P.accent }}>
          {p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(1) : p.value}{unit}</strong>
        </div>
      ))}
    </div>
  );
};

function StatCard({ label, value, sub, color = P.accent, icon, delta = null }) {
  return (
    <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 11, color: P.subtext, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{icon} {label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'DM Serif Display',serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: P.subtext, marginTop: 4 }}>{sub}</div>}
      {delta !== null && (
        <div style={{ fontSize: 11, marginTop: 4, color: delta > 0 ? P.sage : delta < 0 ? P.coral : P.subtext }}>
          {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}% vs prior period
        </div>
      )}
    </div>
  );
}

function HabitRow({ label, data, color }) {
  const rate = pct(data.map(d => d[label] || 0));
  const streak = (() => {
    let s = 0;
    for (let i = data.length - 1; i >= 0; i--) { if (data[i][label]) s++; else break; }
    return s;
  })();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${P.border}` }}>
      <div style={{ width: 110, fontSize: 12, color: P.text }}>{label.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}</div>
      <div style={{ flex: 1, background: "#1a1a2a", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${rate}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s" }} />
      </div>
      <div style={{ width: 40, fontSize: 12, color, textAlign: "right", fontWeight: 700 }}>{rate}%</div>
      <div style={{ width: 60, fontSize: 11, color: P.subtext, textAlign: "right" }}>🔥 {streak}d</div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  // Close on backdrop click or Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position:"fixed",inset:0,zIndex:1000,
      background:"rgba(0,0,0,0.75)",backdropFilter:"blur(4px)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px",
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:"#13131f",border:`1px solid ${P.border}`,borderRadius:16,
        width:"100%",maxWidth:560,maxHeight:"78vh",
        display:"flex",flexDirection:"column",boxShadow:"0 24px 80px rgba(0,0,0,0.6)",
      }}>
        {/* Fixed header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px 16px",borderBottom:`1px solid ${P.border}`,flexShrink:0}}>
          <div style={{fontSize:16,fontFamily:"'DM Serif Display',serif",color:P.text}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:P.subtext,fontSize:20,cursor:"pointer",lineHeight:1,padding:"2px 6px",borderRadius:4}}>×</button>
        </div>
        {/* Scrollable body */}
        <div style={{overflowY:"auto",padding:"20px 24px 24px",flex:1,fontSize:13,color:P.subtext,lineHeight:1.75}}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Footer links (always visible) ───────────────────────────────────────────
function FooterLinks() {
  const [modal, setModal] = useState(null); // "about" | "privacy" | null

  const linkStyle = {
    background:"none",border:"none",cursor:"pointer",
    fontSize:11,color:"#444460",fontFamily:"'DM Sans',sans-serif",
    textDecoration:"underline",textDecorationColor:"#2a2a3e",
    padding:0,transition:"color 0.15s",
  };

  const h = { fontSize:13, color:P.text, fontWeight:600, marginBottom:6, marginTop:20, display:"block" };
  const p = { marginBottom:12, display:"block" };

  return (
    <>
      <div style={{textAlign:"center",padding:"24px 0 16px",userSelect:"none"}}>
        <button style={linkStyle} onMouseEnter={e=>e.target.style.color=P.subtext} onMouseLeave={e=>e.target.style.color="#444460"} onClick={()=>setModal("about")}>About</button>
        <span style={{fontSize:11,color:"#2a2a3e",margin:"0 8px"}}>|</span>
        <button style={linkStyle} onMouseEnter={e=>e.target.style.color=P.subtext} onMouseLeave={e=>e.target.style.color="#444460"} onClick={()=>setModal("privacy")}>Privacy &amp; Terms</button>
      </div>

      {modal === "about" && (
        <Modal title="About" onClose={()=>setModal(null)}>
          <span style={p}>Your life, measured. Your patterns, revealed.</span>
          <span style={h}>What is Teyeme?</span>
          <span style={p}>This is a personal life tracking dashboard built to help you understand your own patterns over time. It visualizes data you've already been collecting — sleep, mood, activity, habits, and more — and turns it into charts, insights, and period-by-period comparisons.</span>
          <span style={h}>How does it work?</span>
          <span style={p}>This dashboard reads CSV exports from your Google Form life tracker. If you don't have one yet, download it! Each time you want to update your data, simply export your responses as a CSV and upload it here. New entries are automatically merged with your existing data — no duplicates, no manual editing required.</span>
          <span style={h}>What can I track?</span>
          <span style={p}>The dashboard covers six areas across dedicated tabs: an Overview with key wellness metrics, Sleep quality and trends, a full Wellness timeline (mood, energy, clarity, stress, productivity, hydration, screen time), Habit completion rates and streaks, Fitness activity including gym sessions and running, and a Period view for monthly and quarterly breakdowns with automatic insights and comparisons.</span>
          <span style={h}>Who built this?</span>
          <span style={p}>This is a personal project by Matthew Han inspired from a tracker he made in 2025. Teyeme is for individual use. It has no accounts, no backend, and no external services. Everything runs entirely in your browser.</span>
          <span style={h}>Do I need an account?</span>
          <span style={p}>No. There are no accounts, no sign-ups, and no logins. Just upload your CSV and your dashboard is ready immediately. Your data is stored locally in your browser using localStorage — it stays on your device. Completely private!</span>
        </Modal>
      )}

      {modal === "privacy" && (
        <Modal title="Privacy &amp; Terms of Use" onClose={()=>setModal(null)}>
          <span style={h}>Your data stays on your device</span>
          <span style={p}>This dashboard does not collect, transmit, or store any of your personal data on any server. All data you upload — including your CSV files and the records derived from them — is stored exclusively in your browser's localStorage. It never leaves your device.</span>
          <span style={h}>No analytics or tracking</span>
          <span style={p}>This application does not use cookies, analytics tools, advertising trackers, or any third-party tracking of any kind. There is no user profiling and no data sharing with any external parties.</span>
          <span style={h}>Data persistence</span>
          <span style={p}>Your data persists in your browser until you clear it manually using the "Clear all data" button, or until you clear your browser's site data. Clearing browser storage will permanently remove your stored data from this device. We recommend keeping your original CSV exports as a backup.</span>
          <span style={h}>Device and browser scope</span>
          <span style={p}>Because data is stored locally, it is specific to the browser and device you are using. If you switch browsers or devices, you will need to re-upload your CSV to restore your data.</span>
          <span style={h}>Security</span>
          <span style={p}>This application is a static, client-side web app with no backend. CSV files are parsed entirely in your browser and are never sent over a network. All numeric fields are parsed as numbers, free-text fields are allowlisted, and file uploads are limited to 10MB to prevent abuse. That said, we recommend not using this dashboard on shared or public computers, as localStorage contents may be accessible to others with access to the browser's developer tools.</span>
          <span style={h}>Terms of Use</span>
          <span style={p}>This tool is provided as-is for personal use. By using this application you agree that you are solely responsible for the data you upload and how you use the insights generated. The application makes no guarantees about the accuracy of derived statistics and is not a substitute for professional medical, fitness, or mental health advice.</span>
          <span style={h}>Changes to this policy</span>
          <span style={p}>As this is a personal project, this policy may be updated over time. Continued use of the application after any changes constitutes acceptance of the updated terms.</span>
        </Modal>
      )}
    </>
  );
}

// ─── Feature pill ─────────────────────────────────────────────────────────────
function FeaturePill({ icon, label }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",background:"#0d0d18",border:`1px solid ${P.border}`,borderRadius:999,fontSize:12,color:P.subtext}}>
      <span style={{fontSize:15}}>{icon}</span>{label}
    </div>
  );
}

// ─── Landing / Empty State ────────────────────────────────────────────────────
function EmptyState({onUpload,dragOver,onDragOver,onDragLeave,onDrop,fileInputRef}) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",paddingTop:40,paddingBottom:16,gap:0}}>

      {/* ── Hero ── */}
      <div style={{marginBottom:20}}>
        <div style={{
          display:"inline-block",fontSize:11,letterSpacing:3,textTransform:"uppercase",
          color:P.accent,border:`1px solid ${P.border}`,borderRadius:999,
          padding:"5px 14px",marginBottom:20,
        }}>Personal Life Analytics</div>

        <h2 style={{
          fontSize:"clamp(28px,5vw,52px)",fontFamily:"'DM Serif Display',serif",fontWeight:400,
          color:P.text,lineHeight:1.2,marginBottom:16,maxWidth:640,
          background:`linear-gradient(135deg, ${P.text} 40%, ${P.accent})`,
          WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
        }}>
          Teyeme
        </h2>

        <p style={{fontSize:15,color:P.subtext,maxWidth:480,lineHeight:1.7,margin:"0 auto 28px"}}>
          Upload your Google Form CSV export and instantly visualize your sleep, mood, fitness, and habits — across any month, quarter, or the full year.
        </p>
      </div>

      {/* ── Feature pills ── */}
      <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginBottom:36,maxWidth:560}}>
        <FeaturePill icon="🌙" label="Sleep tracking"/>
        <FeaturePill icon="😊" label="Mood & energy"/>
        <FeaturePill icon="🏋️" label="Fitness & steps"/>
        <FeaturePill icon="📅" label="Monthly insights"/>
        <FeaturePill icon="📊" label="Comparisons"/>
        <FeaturePill icon="🔒" label="100% private"/>
      </div>

      {/* ── Upload zone ── */}
      <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave} onClick={()=>fileInputRef.current.click()}
        style={{
          border:`2px dashed ${dragOver?P.accent:P.border}`,borderRadius:16,
          padding:"36px 64px",cursor:"pointer",
          background:dragOver?"#1a1a2e":P.panel,
          transition:"all 0.2s",marginBottom:14,
          boxShadow:dragOver?`0 0 40px rgba(204,136,255,0.15)`:"none",
        }}>
        <input ref={fileInputRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>onUpload(e.target.files[0])}/>
        <div style={{fontSize:36,marginBottom:10}}>📂</div>
        <div style={{fontSize:15,color:P.accent,fontWeight:600,marginBottom:4}}>Drop your CSV here to get started</div>
        <div style={{fontSize:12,color:P.muted}}>or click to browse · Google Form Responses export (.csv)</div>
      </div>

      {/* ── Form template CTA ── */}
      <div style={{
        marginTop: 20,
        marginBottom: 30,
        padding: "14px 24px",
        background: "#0d0d18",
        border: `1px solid ${P.border}`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        gap: 14,
        maxWidth: 480,
        width: "100%",
      }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>📋</span>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 13, color: P.text, fontWeight: 500, marginBottom: 2 }}>
            Don't have a tracking form?
          </div>
          <div style={{ fontSize: 12, color: P.subtext, lineHeight: 1.5 }}>
            Use the same Google Form this dashboard was built for.
          </div>
        </div>
        <a
          href="https://docs.google.com/forms/d/10Y-ASOlSA7VV95c0WbyZlSe3QSbOzAyeFHZ08xqUu5s/copy"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: P.accent,
            color: "#0a0a0f",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          Make a copy →
        </a>
      </div>

      <div style={{fontSize:12,color:"#333348",display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:13}}>🔒</span> Your data never leaves this browser — no accounts, no servers, no tracking.
      </div>
      
    </div>
  );
}

function PeriodTab({ allTime }) {
  const [mode, setMode] = useState("month");
  const [selected, setSelected] = useState(null);

  const periods = useMemo(() => {
    const keys = new Set();
    allTime.forEach(d => keys.add(mode === "month" ? monthKey(d.date) : quarterKey(d.date)));
    return Array.from(keys).sort();
  }, [allTime, mode]);

  useEffect(() => {
    if (periods.length) setSelected(periods[periods.length - 1]);
  }, [periods]);

  const currData = useMemo(() => {
    if (!selected) return [];
    return allTime.filter(d => (mode === "month" ? monthKey(d.date) : quarterKey(d.date)) === selected);
  }, [allTime, selected, mode]);

  const prevKey = selected ? (mode === "month" ? prevMonthKey(selected) : prevQuarterKey(selected)) : null;
  const prevData = useMemo(() => {
    if (!prevKey) return [];
    return allTime.filter(d => (mode === "month" ? monthKey(d.date) : quarterKey(d.date)) === prevKey);
  }, [allTime, prevKey, mode]);

  const hasPrev = prevData.length > 0;
  const insights = useMemo(() => generateInsights(currData), [currData]);
  const comps = useMemo(() => generateComparisons(currData, prevData), [currData, prevData]);
  const chartData = currData.map(d => ({ ...d, label: d.date.slice(0, 5) }));
  const xInterval = Math.max(1, Math.floor(chartData.length / 10));
  const periodLabel = selected ? (mode === "month" ? monthLabel(selected) : quarterLabel(selected)) : "";
  const prevLabel = prevKey ? (mode === "month" ? monthLabel(prevKey) : quarterLabel(prevKey)) : "";

  if (!allTime.length) {
    return <div style={{ color: P.subtext, textAlign: "center", paddingTop: 60 }}>Upload data to see period analysis.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: P.panel, border: `1px solid ${P.border}`, borderRadius: 8, padding: 3, gap: 2 }}>
          {["month", "quarter"].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: mode === m ? P.accent : "none",
                color: mode === m ? P.bg : P.subtext,
                border: "none",
                borderRadius: 6,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                fontFamily: "'DM Sans',sans-serif",
              }}>
              {m === "month" ? "Monthly" : "Quarterly"}
            </button>
          ))}
        </div>

        <select
          value={selected || ""}
          onChange={e => setSelected(e.target.value)}
          style={{
            background: P.panel,
            border: `1px solid ${P.border}`,
            borderRadius: 8,
            color: P.text,
            padding: "6px 12px",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif",
          }}>
          {periods.map(p => (
            <option key={p} value={p}>{mode === "month" ? monthLabel(p) : quarterLabel(p)}</option>
          ))}
        </select>

        <div style={{ fontSize: 12, color: P.subtext }}>
          {currData.length} days of data
          {hasPrev && <span style={{ color: P.muted }}> · comparing to {prevLabel}</span>}
        </div>
      </div>

      {!currData.length ? (
        <div style={{ color: P.subtext, textAlign: "center", padding: 40 }}>No data for this period.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatCard
              label="Avg Mood"
              value={avg(currData.map(d => d.happiness)).toFixed(1) + "/6"}
              sub={hasPrev ? `Prev: ${avg(prevData.map(d => d.happiness)).toFixed(1)}` : undefined}
              delta={hasPrev ? diff(avg(currData.map(d => d.happiness)), avg(prevData.map(d => d.happiness))) : null}
              color={P.gold}
              icon="😊"
            />
            <StatCard
              label="Avg Sleep"
              value={avg(currData.map(d => d.sleep)).toFixed(1) + "h"}
              sub={hasPrev ? `Prev: ${avg(prevData.map(d => d.sleep)).toFixed(1)}h` : undefined}
              delta={hasPrev ? diff(avg(currData.map(d => d.sleep)), avg(prevData.map(d => d.sleep))) : null}
              color={P.accent}
              icon="🌙"
            />
            <StatCard
              label="Avg Steps"
              value={Math.round(avg(currData.map(d => d.steps))).toLocaleString()}
              sub={hasPrev ? `Prev: ${Math.round(avg(prevData.map(d => d.steps))).toLocaleString()}` : undefined}
              delta={hasPrev ? diff(avg(currData.map(d => d.steps)), avg(prevData.map(d => d.steps))) : null}
              color={P.teal}
              icon="👟"
            />
            <StatCard
              label="Active Days"
              value={`${pct(currData.map(d => d.active))}%`}
              sub={hasPrev ? `Prev: ${pct(prevData.map(d => d.active))}%` : undefined}
              delta={hasPrev ? diff(pct(currData.map(d => d.active)), pct(prevData.map(d => d.active))) : null}
              color={P.sage}
              icon="🏃"
            />
          </div>

          <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>
              Mood, Energy & Sleep — {periodLabel}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={xInterval} />
                <YAxis tick={{ fill: P.subtext, fontSize: 10 }} />
                <Tooltip content={<Tip />} />
                <Line type="monotone" dataKey="happiness" stroke={P.gold} dot={false} strokeWidth={2} name="Mood" />
                <Line type="monotone" dataKey="energy" stroke={P.teal} dot={false} strokeWidth={2} name="Energy" strokeDasharray="4 2" />
                <Line type="monotone" dataKey="sleep" stroke={P.accent} dot={false} strokeWidth={2} name="Sleep (h)" strokeDasharray="2 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>Daily Steps</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={xInterval} />
                <YAxis tick={{ fill: P.subtext, fontSize: 10 }} />
                <Tooltip content={<Tip unit=" steps" />} />
                <ReferenceLine y={10000} stroke={P.gold} strokeDasharray="4 2" label={{ value: "10k", fill: P.gold, fontSize: 10 }} />
                <Bar dataKey="steps" name="Steps" radius={[2, 2, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.steps >= 10000 ? P.teal : d.steps >= 5000 ? P.accent : P.muted} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20, flex: "1 1 300px" }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 16 }}>
                ✨ {periodLabel} Highlights
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {insights.map((ins, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", background: "#0d0d18", borderRadius: 8, border: `1px solid ${P.border}` }}>
                    <span style={{ fontSize: 16, lineHeight: 1.4 }}>{ins.icon}</span>
                    <span style={{ fontSize: 12, color: ins.color, lineHeight: 1.5 }}>{ins.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20, flex: "1 1 300px" }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 16 }}>
                {hasPrev ? `📊 ${periodLabel} vs ${prevLabel}` : "📊 Comparison"}
              </div>
              {!hasPrev ? (
                <div style={{ color: P.muted, fontSize: 13, paddingTop: 8 }}>
                  No data for {prevLabel || "the previous period"} — upload more months to unlock comparisons.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {comps.map((c, i) => {
                    const arrow = c.change === null ? "—" : c.change > 0 ? "▲" : c.change < 0 ? "▼" : "=";
                    const color = c.change === null || c.change === 0 ? P.subtext : c.better ? P.sage : P.coral;
                    const absPct = c.change === null ? "" : `${Math.abs(c.change)}%`;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#0d0d18", borderRadius: 8, border: `1px solid ${P.border}` }}>
                        <span style={{ fontSize: 14 }}>{c.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: P.subtext }}>{c.label}</div>
                          <div style={{ fontSize: 12, color: P.text, marginTop: 2 }}>
                            {c.fmt(c.currVal)} <span style={{ color: P.muted }}>vs {c.fmt(c.prevVal)}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color }}>{arrow} {absPct}</span>
                          {c.change !== null && c.change !== 0 && (
                            <div style={{ fontSize: 10, color, marginTop: 2 }}>{c.better ? "improved" : "declined"}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 16 }}>
              Habit Completion — {periodLabel}
            </div>
            <HabitRow label="photo" data={currData} color={P.gold} />
            <HabitRow label="bed_made" data={currData} color={P.teal} />
            <HabitRow label="journal" data={currData} color={P.accent} />
            <HabitRow label="leetcode" data={currData} color={P.sage} />
            <HabitRow label="active" data={currData} color={P.coral} />
            <HabitRow label="social" data={currData} color="#a78bfa" />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("Overview");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef();

  // Load persisted data on mount
  useEffect(() => {
    const saved = storage.get();
    if (saved) {
      setRecords(saved.records || []);
      setUploadedFiles(saved.files || []);
    }
    setLoading(false);
  }, []);

  // Persist whenever records/files change (after initial load)
  useEffect(() => {
    if (loading) return;
    const ok = storage.set({ records, files: uploadedFiles });
    if (!ok) showToast("⚠️ Storage quota exceeded — older data may not be saved", "error");
  }, [records, uploadedFiles, loading]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) { showToast("⚠️ Please upload a .csv file", "error"); return; }
    if (file.size > 10 * 1024 * 1024) { showToast("⚠️ File too large (max 10MB)", "error"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const incoming = parseCSV(e.target.result);
        if (!incoming.length) { showToast("⚠️ No valid rows found in this CSV", "error"); return; }
        if (incoming.length > 2000) { showToast("⚠️ Too many rows (max 2000)", "error"); return; }
        setRecords(prev => {
          const merged = mergeRecords(prev, incoming);
          if (merged.length > 2000) { showToast("⚠️ Total records would exceed 2000", "error"); return prev; }
          return merged;
        });
        setUploadedFiles(prev => {
          const entry = { name: file.name, rows: incoming.length, date: new Date().toLocaleDateString() };
          return prev.find(f => f.name === file.name)
            ? prev.map(f => f.name === file.name ? entry : f)
            : [...prev, entry];
        });
        showToast(`✅ Merged ${incoming.length} rows from "${file.name}"`);
      } catch {
        showToast("⚠️ Failed to parse CSV — check the format", "error");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleClearData = () => {
    if (!window.confirm("Clear all stored data? This cannot be undone.")) return;
    setRecords([]);
    setUploadedFiles([]);
    storage.delete();
    showToast("🗑️ All data cleared");
  };

  const onDrop = useCallback((e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }, [handleFile]);
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  // Derived data
  const allTime = records;
  const totalDays = allTime.length;
  const chartData = allTime.map((d, i) => ({ ...d, idx: i, label: d.date.slice(0, 5) }));
  const last7 = allTime.slice(-7);
  const activeDays = allTime.filter(d => d.active).length;
  const gymSessions = allTime.filter(d => d.gymTime > 0).length;
  const totalRun = allTime.reduce((a, d) => a + d.run, 0);
  const avgSteps = Math.round(avg(allTime.map(d => d.steps)));
  const xInterval = Math.max(1, Math.floor(chartData.length / 12));

  const radarData = [
    { metric: "Sleep",     value: Math.min(100, avg(allTime.map(d => d.sleep)) / 9 * 100) },
    { metric: "Energy",    value: avg(allTime.filter(d => d.energy > 0).map(d => d.energy)) / 6 * 100 },
    { metric: "Mood",      value: avg(allTime.map(d => d.happiness)) / 6 * 100 },
    { metric: "Clarity",   value: avg(allTime.filter(d => d.clarity > 0).map(d => d.clarity)) / 6 * 100 },
    { metric: "Fitness",   value: pct(allTime.map(d => d.active)) },
    { metric: "Hydration", value: Math.min(100, avg(allTime.map(d => d.water)) / 2500 * 100) },
  ];

  const dateRange = totalDays > 0 ? `${allTime[0].date} – ${allTime[totalDays - 1].date}` : null;

  if (loading) {
    return (
      <div style={{ background: P.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: P.subtext, fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: P.bg, color: P.text, fontFamily: "'DM Sans',sans-serif", padding: "24px 20px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #2a2a4e; border-radius: 4px; }
        .tab-btn { background: none; border: none; cursor: pointer; padding: 8px 16px; border-radius: 8px;
          font-family: 'DM Sans',sans-serif; font-size: 13px; font-weight: 500; transition: all 0.2s; }
        .tab-btn:hover { background: #1e1e2e; }
        .upload-zone:hover { border-color: #cc88ff !important; background: #1a1a2e !important; }
        select option { background: #111118; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",top:20,right:20,zIndex:999,background:toast.type==="error"?"#2a1a1a":"#1a2a1a",border:`1px solid ${toast.type==="error"?P.coral:P.sage}`,borderRadius:10,padding:"10px 16px",fontSize:13,color:P.text,boxShadow:"0 4px 24px rgba(0,0,0,0.5)"}}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:16}}>
        <div>
          <div style={{fontSize:11,letterSpacing:3,color:P.subtext,textTransform:"uppercase",marginBottom:4}}>Your Year in Data</div>
          <h1 style={{fontSize:28,fontFamily:"'DM Serif Display',serif",fontWeight:400,background:`linear-gradient(135deg,${P.accent},${P.teal})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            Teyeme
          </h1>
          {dateRange && <div style={{fontSize:12,color:P.subtext,marginTop:4}}>{dateRange} · <span style={{color:P.accent}}>{totalDays} days logged</span></div>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,minWidth:230}}>
          <div className="upload-zone" onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave} onClick={()=>fileInputRef.current.click()}
            style={{border:`1.5px dashed ${dragOver?P.accent:P.border}`,borderRadius:10,padding:"10px 16px",cursor:"pointer",background:dragOver?"#1a1a2e":P.panel,textAlign:"center",transition:"all 0.2s"}}>
            <input ref={fileInputRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
            <div style={{fontSize:12,color:P.accent,fontWeight:600}}>📂 Upload CSV</div>
            <div style={{fontSize:10,color:P.muted,marginTop:2}}>Drop or click · new months auto-merge</div>
          </div>
          {uploadedFiles.length>0 && (
            <div style={{background:P.panel,border:`1px solid ${P.border}`,borderRadius:8,overflow:"hidden"}}>
              {uploadedFiles.map((f,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 12px",borderBottom:i<uploadedFiles.length-1?`1px solid ${P.border}`:"none",fontSize:11}}>
                  <span style={{color:P.sage}}>✓ {f.name.length>24?f.name.slice(0,24)+"…":f.name}</span>
                  <span style={{color:P.muted,whiteSpace:"nowrap",marginLeft:8}}>{f.rows} rows</span>
                </div>
              ))}
            </div>
          )}

          {totalDays > 0 && (
            <button onClick={handleClearData} style={{ background: "none", border: `1px solid ${P.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 11, color: P.muted, cursor: "pointer", alignSelf: "flex-end" }}>
              🗑️ Clear all data
            </button>
          )}
        </div>
      </div>

      {/* Empty state or dashboard */}
      {totalDays === 0 ? (
        <>
        <EmptyState onUpload={handleFile} dragOver={dragOver} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} fileInputRef={fileInputRef} />
        </>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 24, background: P.panel, padding: 4, borderRadius: 10, border: `1px solid ${P.border}`, width: "fit-content", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} className="tab-btn" onClick={() => setTab(t)}
                style={{ color: tab === t ? P.bg : P.subtext, background: tab === t ? P.accent : "none" }}>
                {t}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {tab === "Overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatCard label="Avg Mood" value={avg(allTime.map(d => d.happiness)).toFixed(1) + "/6"} sub={`Last 7d: ${avg(last7.map(d => d.happiness)).toFixed(1)}`} color={P.gold} icon="😊" />
                <StatCard label="Avg Sleep" value={avg(allTime.map(d => d.sleep)).toFixed(1) + "h"} sub={`Last 7d: ${avg(last7.map(d => d.sleep)).toFixed(1)}h`} color={P.accent} icon="🌙" />
                <StatCard label="Active Days" value={`${activeDays}/${totalDays}`} sub={`${Math.round(activeDays / totalDays * 100)}% hit rate`} color={P.sage} icon="🏃" />
                <StatCard label="Avg Steps" value={avgSteps.toLocaleString()} sub="daily average" color={P.teal} icon="👟" />
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20, flex: "1 1 280px" }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>Wellness Radar</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke={P.border} />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: P.subtext, fontSize: 11 }} />
                      <Radar dataKey="value" stroke={P.accent} fill={P.accent} fillOpacity={0.15} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20, flex: "2 1 340px" }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>Mood, Energy & Clarity</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                      <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={xInterval} />
                      <YAxis domain={[1, 6]} tick={{ fill: P.subtext, fontSize: 10 }} />
                      <Tooltip content={<Tip />} />
                      <Line type="monotone" dataKey="happiness" stroke={P.gold} dot={false} strokeWidth={2} name="Mood" />
                      <Line type="monotone" dataKey="energy" stroke={P.teal} dot={false} strokeWidth={2} name="Energy" strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="clarity" stroke={P.accent} dot={false} strokeWidth={1.5} name="Clarity" strokeDasharray="2 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>Productivity vs. Stress</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                    <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={xInterval} />
                    <YAxis domain={[0, 6]} tick={{ fill: P.subtext, fontSize: 10 }} />
                    <Tooltip content={<Tip />} />
                    <Line type="monotone" dataKey="productivity" stroke={P.sage} dot={false} strokeWidth={2} name="Productivity" />
                    <Line type="monotone" dataKey="stress" stroke={P.coral} dot={false} strokeWidth={2} name="Stress" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── SLEEP ── */}
          {tab === "Sleep" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatCard label="Avg Sleep" value={avg(allTime.map(d => d.sleep)).toFixed(1) + "h"} color={P.accent} icon="🌙" />
                <StatCard label="Best Night" value={Math.max(...allTime.map(d => d.sleep)).toFixed(1) + "h"} color={P.sage} icon="⭐" />
                <StatCard label="Worst Night" value={Math.min(...allTime.map(d => d.sleep)).toFixed(1) + "h"} color={P.coral} icon="😴" />
                <StatCard label="7h+ Nights" value={allTime.filter(d => d.sleep >= 7).length} sub={`${Math.round(allTime.filter(d => d.sleep >= 7).length / totalDays * 100)}% of days`} color={P.teal} icon="✅" />
              </div>
              <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>Hours Slept Per Night</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                    <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={xInterval} />
                    <YAxis domain={[0, 11]} tick={{ fill: P.subtext, fontSize: 10 }} />
                    <Tooltip content={<Tip unit="h" />} />
                    <ReferenceLine y={7} stroke={P.gold} strokeDasharray="4 2" label={{ value: "goal", fill: P.gold, fontSize: 10 }} />
                    <Bar dataKey="sleep" name="Sleep" radius={[3, 3, 0, 0]}>
                      {chartData.map((d, i) => <Cell key={i} fill={d.sleep >= 7 ? P.teal : d.sleep >= 6 ? P.accent : P.coral} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 8 }}>Sleep vs. Next-Day Mood</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData.slice(0, -1).map((d, i) => ({ ...d, nextMood: chartData[i + 1].happiness }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                    <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={xInterval} />
                    <YAxis tick={{ fill: P.subtext, fontSize: 10 }} />
                    <Tooltip content={<Tip />} />
                    <Line type="monotone" dataKey="sleep" stroke={P.accent} dot={false} strokeWidth={2} name="Sleep (h)" />
                    <Line type="monotone" dataKey="nextMood" stroke={P.gold} dot={false} strokeWidth={2} name="Next-day Mood" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── WELLNESS ── */}
          {tab === "Wellness" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatCard label="Avg Happiness" value={avg(allTime.map(d => d.happiness)).toFixed(2)} sub="/6 scale" color={P.gold} icon="😊" />
                <StatCard label="Avg Energy" value={avg(allTime.filter(d => d.energy > 0).map(d => d.energy)).toFixed(2)} sub="/6 scale" color={P.teal} icon="⚡" />
                <StatCard label="Avg Stress" value={avg(allTime.map(d => d.stress)).toFixed(2)} sub="/6 scale" color={P.coral} icon="😤" />
                <StatCard label="Avg Clarity" value={avg(allTime.filter(d => d.clarity > 0).map(d => d.clarity)).toFixed(2)} sub="/6 scale" color={P.accent} icon="🧠" />
              </div>
              <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>Full Wellness Timeline</div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                    <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={xInterval} />
                    <YAxis domain={[0, 6]} tick={{ fill: P.subtext, fontSize: 10 }} />
                    <Tooltip content={<Tip />} />
                    <Line type="monotone" dataKey="happiness" stroke={P.gold} dot={false} strokeWidth={2} name="Mood" />
                    <Line type="monotone" dataKey="energy" stroke={P.teal} dot={false} strokeWidth={2} name="Energy" />
                    <Line type="monotone" dataKey="clarity" stroke={P.accent} dot={false} strokeWidth={2} name="Clarity" />
                    <Line type="monotone" dataKey="stress" stroke={P.coral} dot={false} strokeWidth={2} name="Stress" />
                    <Line type="monotone" dataKey="productivity" stroke={P.sage} dot={false} strokeWidth={2} name="Productivity" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase" }}>💧 Water Intake (mL)</div>
                  <div style={{ fontSize: 12, color: P.teal }}>Goal: 2500 · Avg: {Math.round(avg(allTime.map(d => d.water)))} mL</div>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                    <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={xInterval} />
                    <YAxis tick={{ fill: P.subtext, fontSize: 10 }} />
                    <Tooltip content={<Tip unit=" mL" />} />
                    <ReferenceLine y={2500} stroke={P.teal} strokeDasharray="4 2" />
                    <Bar dataKey="water" name="Water (mL)" radius={[2, 2, 0, 0]}>
                      {chartData.map((d, i) => <Cell key={i} fill={d.water >= 2500 ? P.teal : d.water >= 2000 ? P.accent : P.muted} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase" }}>📱 Phone Screentime (hrs)</div>
                  <div style={{ fontSize: 12, color: P.subtext }}>Avg: {avg(allTime.map(d => d.screentime)).toFixed(1)}h/day</div>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                    <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={xInterval} />
                    <YAxis tick={{ fill: P.subtext, fontSize: 10 }} />
                    <Tooltip content={<Tip unit="h" />} />
                    <Bar dataKey="screentime" name="Screen Time (h)" radius={[2, 2, 0, 0]}>
                      {chartData.map((d, i) => <Cell key={i} fill={d.screentime <= 3 ? P.sage : d.screentime <= 5 ? P.gold : P.coral} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── HABITS ── */}
          {tab === "Habits" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatCard label="Photo" value={`${pct(allTime.map(d => d.photo))}%`} sub="completion rate" color={P.gold} icon="📸" />
                <StatCard label="Bed Made" value={`${pct(allTime.map(d => d.bed_made))}%`} sub="completion rate" color={P.teal} icon="🛏️" />
                <StatCard label="Journaled" value={`${pct(allTime.map(d => d.journal))}%`} sub="completion rate" color={P.accent} icon="📓" />
                <StatCard label="Leetcode" value={`${pct(allTime.map(d => d.leetcode))}%`} sub="completion rate" color={P.sage} icon="💻" />
              </div>
              <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 16 }}>Habit Rates + Current Streaks</div>
                <HabitRow label="photo" data={allTime} color={P.gold} />
                <HabitRow label="bed_made" data={allTime} color={P.teal} />
                <HabitRow label="journal" data={allTime} color={P.accent} />
                <HabitRow label="leetcode" data={allTime} color={P.sage} />
                <HabitRow label="active" data={allTime} color={P.coral} />
                <HabitRow label="social" data={allTime} color="#a78bfa" />
              </div>
              <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 16 }}>Activity Heatmap</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {allTime.map((d, i) => {
                    const score = d.active + d.photo + d.bed_made + d.journal;
                    const colors = ["#1e1e2e", "#2a2a5e", "#4a4abf", "#6b6bdf", "#cc88ff"];
                    return (
                      <div key={i} title={`${d.date}: ${d.active ? "Active" : "Rest"}, mood ${d.happiness}`}
                        style={{ width: 18, height: 18, borderRadius: 3, background: colors[Math.min(score, colors.length - 1)], cursor: "pointer", transition: "transform 0.1s" }}
                        onMouseEnter={e => e.target.style.transform = "scale(1.4)"}
                        onMouseLeave={e => e.target.style.transform = "scale(1)"}
                      />
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 12, fontSize: 11, color: P.subtext, flexWrap: "wrap" }}>
                  {["No habits", "1 habit", "2 habits", "3+ habits"].map((l, i) => (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: ["#1e1e2e", "#2a2a5e", "#4a4abf", "#cc88ff"][i] }} />
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── FITNESS ── */}
          {tab === "Fitness" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatCard label="Gym Sessions" value={gymSessions} sub={`${Math.round(gymSessions / totalDays * 100)}% of days`} color={P.coral} icon="🏋️" />
                <StatCard label="Total Miles" value={totalRun.toFixed(1)} sub="total distance run" color={P.sage} icon="🏃" />
                <StatCard label="Avg Steps" value={avgSteps.toLocaleString()} sub="daily average" color={P.teal} icon="👟" />
                <StatCard label="10k+ Days" value={allTime.filter(d => d.steps >= 10000).length} sub={`${Math.round(allTime.filter(d => d.steps >= 10000).length / totalDays * 100)}% of days`} color={P.gold} icon="⭐" />
              </div>
              <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>Daily Step Count</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                    <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={xInterval} />
                    <YAxis tick={{ fill: P.subtext, fontSize: 10 }} />
                    <Tooltip content={<Tip unit=" steps" />} />
                    <ReferenceLine y={10000} stroke={P.gold} strokeDasharray="4 2" label={{ value: "10k", fill: P.gold, fontSize: 10 }} />
                    <Bar dataKey="steps" name="Steps" radius={[2, 2, 0, 0]}>
                      {chartData.map((d, i) => <Cell key={i} fill={d.steps >= 10000 ? P.teal : d.steps >= 5000 ? P.accent : P.muted} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20, flex: 1 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>Gym Time (hrs)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={chartData.filter(d => d.gymTime > 0)}>
                      <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                      <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={3} />
                      <YAxis tick={{ fill: P.subtext, fontSize: 10 }} />
                      <Tooltip content={<Tip unit="h" />} />
                      <Bar dataKey="gymTime" name="Gym (h)" fill={P.coral} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20, flex: 1 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>Run Distance (mi)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={chartData.filter(d => d.run > 0)}>
                      <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                      <XAxis dataKey="label" tick={{ fill: P.subtext, fontSize: 10 }} interval={2} />
                      <YAxis tick={{ fill: P.subtext, fontSize: 10 }} />
                      <Tooltip content={<Tip unit=" mi" />} />
                      <Bar dataKey="run" name="Run (mi)" fill={P.sage} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: P.subtext, textTransform: "uppercase", marginBottom: 12 }}>PPL Split</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {["Push", "Pull", "Legs"].map(type => {
                    const count = allTime.filter(d => d.ppl === type).length;
                    return (
                      <div key={type} style={{ flex: 1, background: "#0a0a1a", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontFamily: "'DM Serif Display',serif", color: type === "Push" ? P.coral : type === "Pull" ? P.teal : P.sage }}>{count}</div>
                        <div style={{ fontSize: 11, color: P.subtext, marginTop: 4 }}>{type} sessions</div>
                      </div>
                    );
                  })}
                  <div style={{ flex: 1, background: "#0a0a1a", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontFamily: "'DM Serif Display',serif", color: P.accent }}>{allTime.filter(d => d.run > 0).length}</div>
                    <div style={{ fontSize: 11, color: P.subtext, marginTop: 4 }}>Run days</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "Period" && <PeriodTab allTime={allTime} />}

          <div style={{ marginTop: 32, textAlign: "center", fontSize: 11, color: P.muted }}>
            {totalDays} days · {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""} · data stored locally in your browser
          </div>
        </>
      )}

      <FooterLinks/>
    </div>
  );
}
