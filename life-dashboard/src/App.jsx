import { useState, useRef, useCallback, useEffect } from "react";
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
    if (!date) return null;
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
      ppl:          obj["PPL?"] || "",
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

// ─── Design tokens ───────────────────────────────────────────────────────────
const P = {
  bg: "#0a0a0f", panel: "#111118", border: "#1e1e2e",
  accent: "#cc88ff", gold: "#f5c842", teal: "#4fd1c5",
  coral: "#ff6b6b", sage: "#6bcb77", muted: "#555570",
  text: "#e2e2f0", subtext: "#888899",
};

const TABS = ["Overview", "Sleep", "Wellness", "Habits", "Fitness"];

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

function StatCard({ label, value, sub, color = P.accent, icon }) {
  return (
    <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 11, color: P.subtext, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{icon} {label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'DM Serif Display',serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: P.subtext, marginTop: 4 }}>{sub}</div>}
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

function EmptyState({ onUpload, dragOver, onDragOver, onDragLeave, onDrop, fileInputRef }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 24, textAlign: "center" }}>
      <div style={{ fontSize: 56 }}>📊</div>
      <div>
        <div style={{ fontSize: 24, fontFamily: "'DM Serif Display',serif", color: P.text, marginBottom: 8 }}>No data yet</div>
        <div style={{ fontSize: 14, color: P.subtext, maxWidth: 360, lineHeight: 1.6 }}>
          Upload your Google Form CSV export to get started.<br />
          Your data is stored privately in your browser — nothing is sent anywhere.
        </div>
      </div>
      <div
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current.click()}
        style={{
          border: `2px dashed ${dragOver ? P.accent : P.border}`,
          borderRadius: 16, padding: "32px 56px", cursor: "pointer",
          background: dragOver ? "#1a1a2e" : P.panel, transition: "all 0.2s",
        }}>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => onUpload(e.target.files[0])} />
        <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
        <div style={{ fontSize: 14, color: P.accent, fontWeight: 600 }}>Drop CSV here or click to browse</div>
        <div style={{ fontSize: 12, color: P.muted, marginTop: 4 }}>Google Form Responses export (.csv)</div>
      </div>
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
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const incoming = parseCSV(e.target.result);
        if (!incoming.length) { showToast("⚠️ No valid rows found in this CSV", "error"); return; }
        setRecords(prev => mergeRecords(prev, incoming));
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
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 999,
          background: toast.type === "error" ? "#2a1a1a" : "#1a2a1a",
          border: `1px solid ${toast.type === "error" ? P.coral : P.sage}`,
          borderRadius: 10, padding: "10px 16px", fontSize: 13, color: P.text,
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: P.subtext, textTransform: "uppercase", marginBottom: 4 }}>Teyeme Tracker</div>
          <h1 style={{ fontSize: 28, fontFamily: "'DM Serif Display',serif", fontWeight: 400, background: `linear-gradient(135deg, ${P.accent}, ${P.teal})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Your Year in Data
          </h1>
          {dateRange && (
            <div style={{ fontSize: 12, color: P.subtext, marginTop: 4 }}>
              {dateRange} · <span style={{ color: P.accent }}>{totalDays} days logged</span>
            </div>
          )}
        </div>

        {/* Upload panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 230 }}>
          <div
            className="upload-zone"
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current.click()}
            style={{
              border: `1.5px dashed ${dragOver ? P.accent : P.border}`,
              borderRadius: 10, padding: "10px 16px", cursor: "pointer",
              background: dragOver ? "#1a1a2e" : P.panel, textAlign: "center", transition: "all 0.2s",
            }}>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
            <div style={{ fontSize: 12, color: P.accent, fontWeight: 600 }}>📂 Upload CSV</div>
            <div style={{ fontSize: 10, color: P.muted, marginTop: 2 }}>Drop or click · new months auto-merge</div>
          </div>

          {uploadedFiles.length > 0 && (
            <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 8, overflow: "hidden" }}>
              {uploadedFiles.map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderBottom: i < uploadedFiles.length - 1 ? `1px solid ${P.border}` : "none", fontSize: 11 }}>
                  <span style={{ color: P.sage }}>✓ {f.name.length > 24 ? f.name.slice(0, 24) + "…" : f.name}</span>
                  <span style={{ color: P.muted, whiteSpace: "nowrap", marginLeft: 8 }}>{f.rows} rows</span>
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
        <EmptyState onUpload={handleFile} dragOver={dragOver} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} fileInputRef={fileInputRef} />
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

          <div style={{ marginTop: 32, textAlign: "center", fontSize: 11, color: P.muted }}>
            © 2026 Matthew Han · data stored locally in your browser
          </div>
        </>
      )}
    </div>
  );
}
