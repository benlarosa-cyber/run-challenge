import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — fill these in before deploying
// ─────────────────────────────────────────────────────────────────────────────
// 1. Go to https://jsonbin.io, create a free account
// 2. Create a new Bin with initial content: {"completions":{"Ben":{},"Jake":{}},"skips":{"Ben":{},"Jake":{}},"startDate":""}
// 3. Copy your Bin ID and API Key below
// 4. Go to https://console.anthropic.com, create an API key and paste below
const JSONBIN_BIN_ID = "PASTE_YOUR_BIN_ID_HERE";
const JSONBIN_API_KEY = "PASTE_YOUR_JSONBIN_API_KEY_HERE";
const ANTHROPIC_API_KEY = "PASTE_YOUR_ANTHROPIC_API_KEY_HERE";
// ─────────────────────────────────────────────────────────────────────────────

const BASE_CHALLENGE = [
  { day: 1,  type: "run",  distance: 1   },
  { day: 2,  type: "rest" },
  { day: 3,  type: "run",  distance: 1.5 },
  { day: 4,  type: "rest" },
  { day: 5,  type: "run",  distance: 2   },
  { day: 6,  type: "rest" },
  { day: 7,  type: "rest" },
  { day: 8,  type: "run",  distance: 2.5 },
  { day: 9,  type: "rest" },
  { day: 10, type: "run",  distance: 3   },
  { day: 11, type: "rest" },
  { day: 12, type: "run",  distance: 3.5 },
  { day: 13, type: "rest" },
  { day: 14, type: "rest" },
  { day: 15, type: "run",  distance: 4   },
  { day: 16, type: "rest" },
  { day: 17, type: "run",  distance: 4.5 },
  { day: 18, type: "rest" },
  { day: 19, type: "run",  distance: 5   },
  { day: 20, type: "rest" },
  { day: 21, type: "rest" },
  { day: 22, type: "run",  distance: 5.5 },
  { day: 23, type: "rest" },
  { day: 24, type: "run",  distance: 6   },
  { day: 25, type: "rest" },
  { day: 26, type: "run",  distance: 6.5 },
  { day: 27, type: "rest" },
  { day: 28, type: "rest" },
  { day: 29, type: "run",  distance: 7   },
  { day: 30, type: "rest" },
  { day: 31, type: "run",  distance: 7.5 },
  { day: 32, type: "rest" },
  { day: 33, type: "run",  distance: 8   },
  { day: 34, type: "rest" },
  { day: 35, type: "rest" },
  { day: 36, type: "rest" },
  { day: 37, type: "run",  distance: 9   },
  { day: 38, type: "rest" },
  { day: 39, type: "rest" },
  { day: 40, type: "rest" },
  { day: 41, type: "run",  distance: 10  },
];

const WEEKS = [
  [1,7],[8,14],[15,21],[22,28],[29,35],[36,41]
].map(([s,e]) => BASE_CHALLENGE.filter(d => d.day >= s && d.day <= e));

const USERS = ["Ben","Jake"];
const POLL_MS = 10000;

// ── Helpers ──────────────────────────────────────────────────────────────────
function dayLabel(startDate, dayIndex) {
  if (!startDate) return null;
  const d = new Date(startDate + "T00:00:00");
  d.setDate(d.getDate() + dayIndex);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function todayStr() {
  return new Date().toISOString().slice(0,10);
}

function buildEffectiveSchedule(userSkips = {}) {
  const sched = BASE_CHALLENGE.map(d => ({ ...d }));
  Object.entries(userSkips).forEach(([runDayStr, skip]) => {
    const runDay = Number(runDayStr);
    const movedTo = skip.movedToDay;
    if (!movedTo) return;
    const orig   = sched.find(d => d.day === runDay);
    const target = sched.find(d => d.day === movedTo);
    if (!orig || !target) return;
    orig._skippedTo    = movedTo;
    orig._skipReason   = skip.reason;
    target._skippedFrom   = runDay;
    target._skippedReason = skip.reason;
    target.type     = "run";
    target.distance = orig.distance;
  });
  return sched;
}

function findNextRestDay(afterDay, userSkips = {}) {
  const claimed = new Set(Object.values(userSkips).map(s => s.movedToDay));
  for (const d of BASE_CHALLENGE) {
    if (d.day > afterDay && d.type === "rest" && !claimed.has(d.day)) return d.day;
  }
  return null;
}

// ── JSONBin storage ──────────────────────────────────────────────────────────
async function readBin() {
  const r = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
    headers: { "X-Master-Key": JSONBIN_API_KEY }
  });
  const j = await r.json();
  return j.record;
}

async function writeBin(data) {
  await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Master-Key": JSONBIN_API_KEY },
    body: JSON.stringify(data)
  });
}

// ── Claude pace extraction ───────────────────────────────────────────────────
async function extractPace(base64, mediaType) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 60,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "This is a Strava activity screenshot. Find the average pace (min/km). Reply with ONLY the value in format X:XX /km e.g. '5:42 /km'. If not visible reply: not found" }
          ]
        }]
      })
    });
    const data = await r.json();
    const text = data.content?.find(b => b.type === "text")?.text?.trim() || "";
    if (text.toLowerCase().includes("not found") || !text.includes(":")) return null;
    return text;
  } catch { return null; }
}

// ── Icons ────────────────────────────────────────────────────────────────────
function CheckIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}
function SyncIcon({ spinning }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: spinning ? "spin 1s linear infinite" : "none" }}>
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );
}
function CalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function SkipIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 15 12 5 20 5 4"/>
      <line x1="19" y1="5" x2="19" y2="19"/>
    </svg>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [completions, setCompletions] = useState({ Ben:{}, Jake:{} });
  const [skips, setSkips]             = useState({ Ben:{}, Jake:{} });
  const [startDate, setStartDate]     = useState(todayStr());
  const [editingDate, setEditingDate] = useState(false);
  const [activeUser, setActiveUser]   = useState("Ben");
  const [modal, setModal]             = useState(null);
  const [preview, setPreview]         = useState(null);
  const [skipReason, setSkipReason]   = useState("");
  const [viewImg, setViewImg]         = useState(null);
  const [syncing, setSyncing]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [lastSync, setLastSync]       = useState(null);
  const [syncError, setSyncError]     = useState(false);
  const [animDay, setAnimDay]         = useState(null);
  const [loaded, setLoaded]           = useState(false);
  const fileRef  = useRef();
  const pollRef  = useRef();

  // ── Storage ──────────────────────────────────────────────────────────────
  const load = useCallback(async (spinner = false) => {
    if (spinner) setSyncing(true);
    setSyncError(false);
    try {
      const data = await readBin();
      setCompletions(data.completions || { Ben:{}, Jake:{} });
      setSkips(data.skips || { Ben:{}, Jake:{} });
      if (data.startDate) setStartDate(data.startDate);
      setLastSync(Date.now());
    } catch { setSyncError(true); }
    finally { setSyncing(false); setLoaded(true); }
  }, []);

  const save = useCallback(async (patch) => {
    setSaving(true);
    setSyncError(false);
    try {
      const current = await readBin();
      await writeBin({ ...current, ...patch });
      setLastSync(Date.now());
    } catch { setSyncError(true); }
    finally { setSaving(false); }
  }, []);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    pollRef.current = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [load]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const userSched    = (u) => buildEffectiveSchedule(skips[u] || {});
  const getCompletion = (u, day) => completions[u]?.[day];
  const getSkip       = (u, day) => skips[u]?.[day];

  const totalKm   = BASE_CHALLENGE.filter(d => d.type==="run").reduce((s,d) => s+d.distance, 0);
  const totalRuns = BASE_CHALLENGE.filter(d => d.type==="run").length;

  const completedKm = (u) =>
    userSched(u).filter(d => d.type==="run" && getCompletion(u,d.day)).reduce((s,d)=>s+d.distance,0);
  const completedRuns = (u) =>
    userSched(u).filter(d => d.type==="run" && getCompletion(u,d.day)).length;

  const currentDay = (() => {
    for (const d of BASE_CHALLENGE) {
      if (!getCompletion("Ben",d.day) || !getCompletion("Jake",d.day)) return d.day;
    }
    return 41;
  })();

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleConfirmUpload = async () => {
    if (!preview) return;
    const { day, user } = modal;
    const sched  = userSched(user);
    const d      = sched.find(x => x.day === day);
    const isRun  = d.type === "run" || !!d._skippedFrom;

    const entry    = { img: preview, ts: Date.now(), pace: null, paceLoading: isRun };
    const nextComp = { ...completions, [user]: { ...completions[user], [day]: entry } };
    setCompletions(nextComp);
    setAnimDay(day);
    setTimeout(() => setAnimDay(null), 700);
    closeModal();
    await save({ completions: nextComp, skips, startDate });

    if (isRun) {
      const base64    = preview.split(",")[1];
      const mediaType = preview.split(";")[0].split(":")[1] || "image/jpeg";
      const pace      = await extractPace(base64, mediaType);
      const updated   = { ...entry, pace: pace || "—", paceLoading: false };
      const updComp   = { ...nextComp, [user]: { ...nextComp[user], [day]: updated } };
      setCompletions(updComp);
      await save({ completions: updComp, skips, startDate });
    }
  };

  const handleConfirmSkip = async () => {
    if (!skipReason.trim()) return;
    const { day, user } = modal;
    const nextRestDay = findNextRestDay(day, skips[user] || {});
    if (!nextRestDay) { closeModal(); return; }
    const nextSkips = {
      ...skips,
      [user]: { ...skips[user], [day]: { reason: skipReason.trim(), movedToDay: nextRestDay } }
    };
    setSkips(nextSkips);
    closeModal();
    await save({ completions, skips: nextSkips, startDate });
  };

  const handleUndoSkip = async (day, user) => {
    const ns = { ...skips, [user]: { ...skips[user] } };
    delete ns[user][day];
    setSkips(ns);
    await save({ completions, skips: ns, startDate });
  };

  const handleUndo = async (day, user) => {
    const u2 = { ...completions[user] };
    delete u2[day];
    const nc = { ...completions, [user]: u2 };
    setCompletions(nc);
    await save({ completions: nc, skips, startDate });
  };

  const handleDateChange = async (val) => {
    setStartDate(val);
    setEditingDate(false);
    await save({ completions, skips, startDate: val });
  };

  const closeModal = () => { setModal(null); setPreview(null); setSkipReason(""); };

  const syncAgo = lastSync ? (() => {
    const s = Math.floor((Date.now()-lastSync)/1000);
    if (s < 10) return "just now";
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s/60)}m ago`;
  })() : null;

  // ── Config check ─────────────────────────────────────────────────────────
  const isConfigured = JSONBIN_BIN_ID !== "PASTE_YOUR_BIN_ID_HERE";

  if (!isConfigured) {
    return (
      <div style={S.root}>
        <style>{css}</style>
        <div style={{ padding: 24, maxWidth: 440, margin: "40px auto" }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, marginBottom:8 }}>⚙️ Setup Required</div>
          <p style={{ color:"#555", fontSize:14, lineHeight:1.6, marginBottom:16 }}>
            Open <code style={S.code}>src/App.jsx</code> and fill in the three config values at the top of the file:
          </p>
          <div style={S.setupStep}>
            <div style={S.setupNum}>1</div>
            <div>
              <strong>JSONBin</strong> — go to <a href="https://jsonbin.io" target="_blank" rel="noreferrer" style={S.link}>jsonbin.io</a>, create a free account, create a new Bin with this initial content:<br/>
              <code style={{ ...S.code, display:"block", marginTop:6, wordBreak:"break-all" }}>
                {`{"completions":{"Ben":{},"Jake":{}},"skips":{"Ben":{},"Jake":{}},"startDate":""}`}
              </code>
              Then copy the Bin ID and API Key into <code style={S.code}>JSONBIN_BIN_ID</code> and <code style={S.code}>JSONBIN_API_KEY</code>.
            </div>
          </div>
          <div style={S.setupStep}>
            <div style={S.setupNum}>2</div>
            <div>
              <strong>Anthropic API Key</strong> — go to <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={S.link}>console.anthropic.com</a>, create an API key and paste into <code style={S.code}>ANTHROPIC_API_KEY</code>.<br/>
              <span style={{ fontSize:12, color:"#999" }}>This is used to read pace from Strava screenshots.</span>
            </div>
          </div>
          <div style={S.setupStep}>
            <div style={S.setupNum}>3</div>
            <div>Run <code style={S.code}>npm run build</code> then drag the <code style={S.code}>dist/</code> folder to <a href="https://vercel.com" target="_blank" rel="noreferrer" style={S.link}>Vercel</a> or <a href="https://netlify.com" target="_blank" rel="noreferrer" style={S.link}>Netlify</a> to deploy.</div>
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) return (
    <div style={{ ...S.root, display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
      <style>{css}</style>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🏃</div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:"#1a1a1a", letterSpacing:1 }}>Loading challenge...</div>
        <div style={{ color:"#aaa", fontSize:12, marginTop:6 }}>Syncing shared data</div>
      </div>
    </div>
  );

  return (
    <div style={S.root}>
      <style>{css}</style>

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={S.logoRow}>
          <span style={{ fontSize:26 }}>🏃</span>
          <div style={{ flex:1 }}>
            <div style={S.logoTitle}>41 Day Run Challenge</div>
            <div style={S.logoSub}>Ben &amp; Jake · 1km → 10km</div>
          </div>
          <button style={S.syncBtn} onClick={() => load(true)}>
            <SyncIcon spinning={syncing || saving} />
            <span style={{ fontSize:9, color: syncError?"#ef4444":"#bbb" }}>
              {syncError?"Error": (syncing||saving)?"Syncing": syncAgo}
            </span>
          </button>
        </div>

        {/* Start date */}
        <div style={S.dateRow}>
          <CalIcon />
          <span style={S.dateLabel}>Start date:</span>
          {editingDate ? (
            <input type="date" defaultValue={startDate} style={S.dateInput} autoFocus
              onBlur={e => handleDateChange(e.target.value)}
              onChange={e => e.target.value && handleDateChange(e.target.value)} />
          ) : (
            <button style={S.datePill} onClick={() => setEditingDate(true)}>
              {startDate
                ? new Date(startDate+"T00:00:00").toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})
                : "Set date"}
              <span style={{ fontSize:9, color:"#bbb", marginLeft:5 }}>✎</span>
            </button>
          )}
        </div>

        {/* Stat cards */}
        <div style={S.statsRow}>
          {USERS.map(u => (
            <div key={u}
              style={{ ...S.statCard, border: activeUser===u ? "1.5px solid #1a1a1a" : "1.5px solid #e8e3dc", opacity: activeUser===u ? 1 : 0.5 }}
              onClick={() => setActiveUser(u)}>
              <div style={S.statName}>{u}</div>
              <div style={S.statKm}>{completedKm(u).toFixed(1)}<span style={S.statUnit}> km</span></div>
              <div style={S.statRuns}>{completedRuns(u)} / {totalRuns} runs</div>
              <div style={S.progressBar}>
                <div style={{ ...S.progressFill, width:`${(completedKm(u)/totalKm)*100}%`, background: u==="Ben"?"#f97316":"#3b82f6" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Toggle */}
        <div style={S.toggleRow}>
          <span style={S.toggleLabel}>Logging as:</span>
          <div style={S.toggle}>
            {USERS.map(u => (
              <button key={u} style={{ ...S.toggleBtn, ...(activeUser===u ? S.toggleBtnActive : {}) }}
                onClick={() => setActiveUser(u)}>{u}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Day grid ── */}
      <div style={S.body}>
        {WEEKS.map((week, wi) => {
          const activeSched = userSched(activeUser);
          return (
            <div key={wi} style={S.week}>
              <div style={S.weekLabel}>Week {wi+1}</div>
              <div style={S.weekGrid}>
                {week.map(baseDay => {
                  const d           = activeSched.find(x => x.day === baseDay.day);
                  const isRun       = d.type === "run";
                  const activeDone  = getCompletion(activeUser, d.day);
                  const activeSkip  = getSkip(activeUser, d.day);
                  const isSkippedTo = !!d._skippedFrom;
                  const isSkippedOut= !!d._skippedTo;
                  const isCurrent   = d.day === currentDay;
                  const isPast      = d.day < currentDay;
                  const isMissed    = isPast && !activeDone && isRun && !activeSkip && !isSkippedOut;
                  const dateStr     = startDate ? dayLabel(startDate, d.day-1) : null;

                  // Both users done = fully green; active user done = light green
                  const benDone  = getCompletion("Ben",  d.day);
                  const jakeDone = getCompletion("Jake", d.day);
                  const bothDone = benDone && jakeDone;

                  return (
                    <div key={d.day} className={animDay===d.day ? "pop" : ""}
                      style={{
                        ...S.dayCard,
                        ...(isRun && !isSkippedOut ? S.dayRun : {}),
                        ...(!isRun && !isSkippedTo ? S.dayRest : {}),
                        ...(isSkippedTo  ? S.daySkippedTo  : {}),
                        ...(isSkippedOut ? S.daySkippedOut : {}),
                        ...(isCurrent && !isSkippedOut ? S.dayCurrent : {}),
                        ...(activeDone   ? S.dayDone    : {}),
                        ...(bothDone     ? S.dayBothDone : {}),
                        ...(isMissed     ? S.dayMissed  : {}),
                      }}>

                      {/* Top row */}
                      <div style={S.dayTop}>
                        <div>
                          <div style={S.dayNum}>Day {d.day}</div>
                          {dateStr && <div style={S.dayDate}>{dateStr}</div>}
                        </div>
                        <div style={{ textAlign:"right" }}>
                          {isSkippedOut ? (
                            <span style={S.skippedOutTag}>SKIPPED</span>
                          ) : isRun ? (
                            <span style={S.dayDist}>{d.distance}km</span>
                          ) : isSkippedTo ? (
                            <span style={S.skippedToTag}>{d.distance}km↑</span>
                          ) : (
                            <span style={S.dayRestTag}>REST</span>
                          )}
                        </div>
                      </div>

                      {/* Both done big green tick */}
                      {bothDone && (
                        <div style={S.bothDoneTick}>
                          <CheckIcon size={14} />
                        </div>
                      )}

                      {/* Skip notes */}
                      {isSkippedOut && d._skipReason && (
                        <div style={S.skipNote}>"{d._skipReason}" → Day {d._skippedTo}</div>
                      )}
                      {isSkippedTo && d._skippedReason && (
                        <div style={S.skipNote}>moved from Day {d._skippedFrom}</div>
                      )}

                      {/* Proof thumbnails */}
                      <div style={S.proofRow}>
                        {USERS.map(u => {
                          const done = getCompletion(u, d.day);
                          return (
                            <div key={u}
                              style={{ ...S.proofSlot, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}
                              onClick={() => done && setViewImg({ src:done.img, label:`${u} · Day ${d.day}` })}>
                              {done ? (
                                <div style={S.proofThumb}>
                                  <img src={done.img} alt="" style={S.thumbImg} />
                                  <div style={{ ...S.proofBadge, background: "#22c55e" }}><CheckIcon /></div>
                                </div>
                              ) : (
                                <div style={{ ...S.proofEmpty, borderColor: u==="Ben"?"#f9731440":"#3b82f640" }}>
                                  <span style={{ fontSize:8, color:"#bbb", fontWeight:700 }}>{u[0]}</span>
                                </div>
                              )}
                              {done && (isRun||isSkippedTo) && (
                                <div style={{ fontSize:8, color:"#22c55e", fontWeight:700, letterSpacing:0.2, lineHeight:1 }}>
                                  {done.paceLoading ? "…" : done.pace || ""}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Action buttons */}
                      {isSkippedOut ? (
                        <button style={S.undoSkipBtn} onClick={() => handleUndoSkip(d.day, activeUser)}>✕ undo skip</button>
                      ) : !activeDone ? (
                        <div style={{ display:"flex", gap:4 }}>
                          <button style={{ ...S.uploadBtn, flex:1 }}
                            onClick={() => { setModal({ type:"upload", day:d.day, user:activeUser }); setPreview(null); }}>
                            <UploadIcon />
                            <span>{isRun||isSkippedTo ? "Strava" : "Walk"}</span>
                          </button>
                          {isRun && !isSkippedTo && findNextRestDay(d.day, skips[activeUser]||{}) && (
                            <button style={S.skipBtn}
                              onClick={() => setModal({ type:"skip", day:d.day, user:activeUser })}>
                              <SkipIcon />
                            </button>
                          )}
                        </div>
                      ) : (
                        <button style={S.undoBtn} onClick={() => handleUndo(d.day, activeUser)}>✕ undo</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Upload modal ── */}
      {modal?.type==="upload" && (() => {
        const sched = userSched(modal.user);
        const d     = sched.find(x => x.day===modal.day);
        const isRun = d.type==="run" || !!d._skippedFrom;
        return (
          <div style={S.overlay} onClick={closeModal}>
            <div style={S.modalBox} onClick={e => e.stopPropagation()}>
              <div style={S.modalHeader}>
                <div style={S.modalTitle}>Day {modal.day} · {modal.user}</div>
                <div style={S.modalSub}>
                  {isRun ? `Upload your Strava screenshot for the ${d.distance}km run` : "Upload a photo of your rest day walk"}
                </div>
              </div>
              {!preview ? (
                <div style={S.dropZone} onClick={() => fileRef.current.click()}>
                  <div style={{ fontSize:32, marginBottom:8 }}>{isRun?"📱":"🚶"}</div>
                  <div style={S.dropText}>{isRun?"Select Strava screenshot":"Select walk photo"}</div>
                  <div style={S.dropHint}>JPG · PNG · HEIC</div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFileChange} />
                </div>
              ) : (
                <div style={S.previewWrap}><img src={preview} alt="preview" style={S.previewImg} /></div>
              )}
              <div style={S.modalActions}>
                <button style={S.cancelBtn} onClick={closeModal}>Cancel</button>
                {!preview && <button style={S.confirmBtn} onClick={() => fileRef.current.click()}>Choose photo</button>}
                {preview && (
                  <>
                    <button style={S.rePickBtn} onClick={() => { setPreview(null); fileRef.current.click(); }}>Re-pick</button>
                    <button style={S.confirmBtn} onClick={handleConfirmUpload}>{saving?"Saving…":"✓ Confirm"}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Skip modal ── */}
      {modal?.type==="skip" && (() => {
        const nextRest = findNextRestDay(modal.day, skips[modal.user]||{});
        const nextDate = nextRest && startDate ? dayLabel(startDate, nextRest-1) : null;
        const d        = BASE_CHALLENGE.find(x => x.day===modal.day);
        return (
          <div style={S.overlay} onClick={closeModal}>
            <div style={S.modalBox} onClick={e => e.stopPropagation()}>
              <div style={S.modalHeader}>
                <div style={S.modalTitle}>Skip Day {modal.day}?</div>
                <div style={S.modalSub}>
                  Your {d.distance}km run will move to Day {nextRest}{nextDate?` (${nextDate})`:""}
                </div>
              </div>
              <div style={S.skipReasonWrap}>
                <div style={S.skipReasonLabel}>Reason for skipping <span style={{ color:"#ef4444" }}>*</span></div>
                <textarea style={S.skipReasonInput}
                  placeholder="e.g. feeling sick, injury, work commitment..."
                  value={skipReason} onChange={e => setSkipReason(e.target.value)}
                  rows={3} autoFocus />
              </div>
              <div style={S.modalActions}>
                <button style={S.cancelBtn} onClick={closeModal}>Cancel</button>
                <button
                  style={{ ...S.confirmBtn, background: skipReason.trim()?"#f97316":"#e8e3dc", color: skipReason.trim()?"#fff":"#bbb" }}
                  disabled={!skipReason.trim()} onClick={handleConfirmSkip}>
                  Skip run →
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Lightbox ── */}
      {viewImg && (
        <div style={S.overlay} onClick={() => setViewImg(null)}>
          <div style={S.lightbox} onClick={e => e.stopPropagation()}>
            <div style={S.lightboxLabel}>{viewImg.label}</div>
            <img src={viewImg.src} alt="" style={S.lightboxImg} />
            <button style={S.lightboxClose} onClick={() => setViewImg(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f0ede8; }
  @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes popAnim { 0%{transform:scale(1)} 45%{transform:scale(1.07)} 100%{transform:scale(1)} }
  .pop { animation: popAnim 0.5s cubic-bezier(0.36,0.07,0.19,0.97); }
  textarea:focus { outline:none; border-color:#22c55e !important; }
  input[type=date] { color-scheme:light; }
`;

const S = {
  root: { fontFamily:"'DM Sans',sans-serif", background:"#f0ede8", minHeight:"100vh", color:"#1a1a1a", maxWidth:480, margin:"0 auto" },

  header: { background:"linear-gradient(160deg,#ffffff 0%,#f5f2ed 100%)", padding:"18px 16px 12px", borderBottom:"1px solid #e0dbd3", position:"sticky", top:0, zIndex:10 },
  logoRow: { display:"flex", alignItems:"center", gap:10, marginBottom:10 },
  logoTitle: { fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, lineHeight:1, color:"#1a1a1a" },
  logoSub: { fontSize:10, color:"#999", marginTop:2 },
  syncBtn: { display:"flex", flexDirection:"column", alignItems:"center", gap:2, background:"transparent", border:"none", cursor:"pointer", color:"#bbb", padding:"4px 6px" },

  dateRow: { display:"flex", alignItems:"center", gap:6, marginBottom:12, color:"#999" },
  dateLabel: { fontSize:11, color:"#aaa" },
  datePill: { background:"#ede9e3", border:"1px solid #ddd8d0", borderRadius:7, padding:"4px 10px", color:"#555", fontSize:11, fontFamily:"'DM Sans',sans-serif", fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center" },
  dateInput: { background:"#fff", border:"1px solid #22c55e", borderRadius:7, padding:"4px 8px", color:"#1a1a1a", fontSize:11, fontFamily:"'DM Sans',sans-serif" },

  statsRow: { display:"flex", gap:8, marginBottom:10 },
  statCard: { flex:1, background:"#fff", borderRadius:11, padding:"9px 11px", cursor:"pointer", transition:"all 0.2s" },
  statName: { fontSize:9, color:"#aaa", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 },
  statKm: { fontFamily:"'Bebas Neue',sans-serif", fontSize:24, lineHeight:1.15, marginTop:2, color:"#1a1a1a" },
  statUnit: { fontSize:14, color:"#aaa" },
  statRuns: { fontSize:9, color:"#bbb", marginTop:1 },
  progressBar: { height:2, background:"#ede9e3", borderRadius:2, marginTop:6 },
  progressFill: { height:"100%", borderRadius:2, transition:"width 0.6s ease" },

  toggleRow: { display:"flex", alignItems:"center", gap:8 },
  toggleLabel: { fontSize:11, color:"#bbb" },
  toggle: { display:"flex", background:"#ede9e3", borderRadius:7, padding:3, gap:2 },
  toggleBtn: { padding:"4px 16px", borderRadius:5, border:"none", background:"transparent", color:"#aaa", fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:600, cursor:"pointer", transition:"all 0.15s" },
  toggleBtnActive: { background:"#1a1a1a", color:"#fff" },

  body: { padding:"12px 12px 48px" },
  week: { marginBottom:18 },
  weekLabel: { fontFamily:"'Bebas Neue',sans-serif", fontSize:11, letterSpacing:2, color:"#c8c2ba", marginBottom:6, textTransform:"uppercase" },
  weekGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(112px,1fr))", gap:6 },

  dayCard: { borderRadius:10, padding:"8px 8px 6px", border:"1px solid #e5e0d8", background:"#fff", transition:"background 0.3s, border-color 0.3s" },
  dayRun: {},
  dayRest: { background:"#f7f4f0", borderColor:"#ece7e0" },
  dayDone: { background:"#f0faf0", borderColor:"#bbdebb" },
  dayBothDone: { background:"#e8f7e8", borderColor:"#22c55e" },
  dayMissed: { borderColor:"#f5c5c5", background:"#fdf3f3" },
  dayCurrent: { borderColor:"#f97316", boxShadow:"0 0 0 1px #f9731618" },
  daySkippedOut: { background:"#faf8f4", borderColor:"#e8e0cc", opacity:0.7 },
  daySkippedTo: { background:"#f2f7ec", borderColor:"#c8dfa8" },

  dayTop: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 },
  dayNum: { fontSize:10, color:"#bbb", fontWeight:700 },
  dayDate: { fontSize:9, color:"#c8c2ba", marginTop:1 },
  dayDist: { fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color:"#f97316", letterSpacing:0.5 },
  dayRestTag: { fontSize:7, color:"#ccc", fontWeight:700, letterSpacing:1, marginTop:1 },
  skippedOutTag: { fontSize:7, color:"#c8a050", fontWeight:700, letterSpacing:0.5 },
  skippedToTag: { fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color:"#6aaa30", letterSpacing:0.5 },
  skipNote: { fontSize:8, color:"#bbb", marginBottom:5, lineHeight:1.3, fontStyle:"italic" },

  bothDoneTick: { display:"flex", alignItems:"center", justifyContent:"center", width:22, height:22, borderRadius:"50%", background:"#22c55e", color:"#fff", margin:"0 auto 4px" },

  proofRow: { display:"flex", gap:4, justifyContent:"center", marginBottom:6 },
  proofSlot: { cursor:"pointer" },
  proofThumb: { position:"relative", width:28, height:28 },
  thumbImg: { width:28, height:28, borderRadius:5, objectFit:"cover", display:"block" },
  proofBadge: { position:"absolute", bottom:-3, right:-3, width:12, height:12, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", border:"1.5px solid #fff", color:"#fff" },
  proofEmpty: { width:28, height:28, borderRadius:5, border:"1.5px dashed", display:"flex", alignItems:"center", justifyContent:"center" },

  uploadBtn: { display:"flex", alignItems:"center", justifyContent:"center", gap:3, padding:"4px 0", background:"#f0ede8", border:"none", borderRadius:6, color:"#999", fontSize:9, fontFamily:"'DM Sans',sans-serif", fontWeight:600, cursor:"pointer" },
  skipBtn: { display:"flex", alignItems:"center", justifyContent:"center", padding:"4px 7px", background:"#fdf5e6", border:"1px solid #f0ddb0", borderRadius:6, color:"#c09030", cursor:"pointer" },
  undoBtn: { display:"block", width:"100%", padding:"4px 0", background:"transparent", border:"none", color:"#ccc", fontSize:9, fontFamily:"'DM Sans',sans-serif", cursor:"pointer", textAlign:"center" },
  undoSkipBtn: { display:"block", width:"100%", padding:"4px 0", background:"transparent", border:"none", color:"#c09030", fontSize:9, fontFamily:"'DM Sans',sans-serif", cursor:"pointer", textAlign:"center" },

  overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:100, backdropFilter:"blur(6px)" },
  modalBox: { background:"#fff", borderRadius:"18px 18px 0 0", padding:"20px 18px 36px", width:"100%", maxWidth:480, border:"1px solid #e8e3dc", borderBottom:"none" },
  modalHeader: { marginBottom:16 },
  modalTitle: { fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, color:"#1a1a1a" },
  modalSub: { fontSize:12, color:"#aaa", marginTop:3 },
  dropZone: { border:"2px dashed #e0dbd3", borderRadius:12, padding:"26px 20px", textAlign:"center", cursor:"pointer", marginBottom:16 },
  dropText: { fontSize:13, color:"#555", fontWeight:600 },
  dropHint: { fontSize:10, color:"#bbb", marginTop:4 },
  previewWrap: { marginBottom:16, borderRadius:10, overflow:"hidden" },
  previewImg: { width:"100%", maxHeight:220, objectFit:"cover", display:"block" },
  modalActions: { display:"flex", gap:8 },
  cancelBtn: { flex:1, padding:"11px", background:"#f0ede8", border:"none", borderRadius:9, color:"#999", fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:600, cursor:"pointer" },
  rePickBtn: { flex:1, padding:"11px", background:"#f0ede8", border:"none", borderRadius:9, color:"#777", fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:600, cursor:"pointer" },
  confirmBtn: { flex:2, padding:"11px", background:"#22c55e", border:"none", borderRadius:9, color:"#fff", fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:700, cursor:"pointer" },

  skipReasonWrap: { marginBottom:16 },
  skipReasonLabel: { fontSize:12, color:"#777", marginBottom:8, fontWeight:600 },
  skipReasonInput: { width:"100%", background:"#f7f4f0", border:"1px solid #e0dbd3", borderRadius:10, padding:"10px 12px", color:"#1a1a1a", fontSize:13, fontFamily:"'DM Sans',sans-serif", resize:"none" },

  lightbox: { background:"#fff", borderRadius:14, padding:16, maxWidth:440, width:"90%", textAlign:"center", marginBottom:20 },
  lightboxLabel: { fontFamily:"'Bebas Neue',sans-serif", fontSize:15, letterSpacing:1, marginBottom:10, color:"#777" },
  lightboxImg: { width:"100%", borderRadius:9, maxHeight:360, objectFit:"contain", display:"block" },
  lightboxClose: { marginTop:12, padding:"8px 26px", background:"#f0ede8", border:"none", borderRadius:7, color:"#888", fontFamily:"'DM Sans',sans-serif", fontWeight:600, cursor:"pointer", fontSize:12 },

  // Setup screen
  code: { background:"#f0ede8", borderRadius:4, padding:"2px 5px", fontSize:12, fontFamily:"monospace" },
  link: { color:"#f97316", textDecoration:"none" },
  setupStep: { display:"flex", gap:12, marginBottom:20, padding:16, background:"#f7f4f0", borderRadius:12, fontSize:13, color:"#444", lineHeight:1.6 },
  setupNum: { width:24, height:24, borderRadius:"50%", background:"#1a1a1a", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13, flexShrink:0, marginTop:2 },
};
