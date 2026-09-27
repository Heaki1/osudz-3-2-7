import { useState, useEffect, useRef } from "react";
import { api, type ApiRound, type ApiRoundDetail } from "../../api/client";

// ── Seeded triangle background ────────────────────────────────────────────────
function sr(s: number) {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
const TRIANGLES = Array.from({ length: 36 }, (_, i) => ({
  x: sr(i) * 1400, y: sr(i + 100) * 900,
  size: 32 + sr(i + 200) * 88,
  opacity: 0.035 + sr(i + 300) * 0.06,
  flip: sr(i + 400) > 0.48,
}));

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = {
  id: number; label: string; title: string; dates: string;
  color: string; status: "done" | "in-progress" | "mostly-done" | "upcoming";
  startDay: number; endDay: number; totalDays: number;
  desc: string; doneWhen: string;
  active?: boolean;
};

// ── Data ──────────────────────────────────────────────────────────────────────
const PHASES: Phase[] = [
  {
    id: 0, label: "Phase 0", title: "Eligible", dates: "Before joining",
    color: "#ffd700", status: "in-progress", active: false,
    startDay: 0, endDay: 0, totalDays: 0,
    desc: "Make sure your osu! profile country is set to Algeria. Exceptional users may submit and vote but cannot play challenges.",
    doneWhen: "You have an Algerian flag on your osu! profile",
  },
  {
    id: 1, label: "Phase 1", title: "Submission Phase", dates: "1st – 7th of each month",
    color: "#ff9500", status: "in-progress", active: true,
    startDay: 1, endDay: 7, totalDays: 7,
    desc: "Submit a beatmap with your chosen mod requirements and challenge type. Admins review and approve or reject submissions. Earning dzpp when the phase closes.",
    doneWhen: "Your beatmap gets approved",
  },
  {
    id: 2, label: "Phase 2", title: "Vote Phase", dates: "8th – 14th of each month",
    color: "#4499dd", status: "upcoming", active: false,
    startDay: 8, endDay: 14, totalDays: 7,
    desc: "Browse the approved shortlist and cast your vote. You can change your vote at any time before the phase closes. No self-voting. Earn dzpp when voting closes.",
    doneWhen: "The voting phase closes on the 14th",
  },
  {
    id: 3, label: "Phase 3", title: "Challenge Phase", dates: "15th – end of month",
    color: "#88cc44", status: "mostly-done", active: false,
    startDay: 15, endDay: 0, totalDays: 15,
    desc: "Compete on the winning beatmap. Submit any score to earn dzpp for engagement. Submit with required mods and challenge type to qualify for placement and the winner prize.",
    doneWhen: "The challenge phase closes at end of month",
  },
];

const PHASE4 = [
  {
    emoji: "🎮", title: "Eligibility Rules",
    bullets: [
      "Country eligibility — Algeria flag required.",
      "Exceptions may occur for some users.",
      "Submitting, Voting, and Playing challenges are all validated by country.",
    ],
  },
  {
    emoji: "📜", title: "Submission Rules",
    bullets: [
      "Submitted beatmap must have a leaderboard.",
      "Submissions can be approved or rejected by admins.",
      "Submissions with a vague challenge description are rejected.",
      "Users whose submission was rejected may submit again.",
    ],
  },
  {
    emoji: "📅", title: "Voting Rules",
    bullets: [
      "One vote per player per round.",
      "Votes can be changed before the voting phase closes.",
      "No self-voting allowed.",
    ],
  },
  {
    emoji: "⏰", title: "Challenge Rules",
    bullets: [
      "Each challenge has its own leaderboard based on the challenge type.",
      "Required mods must be used to qualify.",
      "Full Combo challenges require FC with no single miss.",
      "Placement is only counted for qualified scores.",
      "Field-size scaling applies to rankings.",
    ],
  },
];

const OSU_DZPP = [
  { q: "What is osu!dzpp?",       detail: "Community platform where Algerian players select challenges and compete for dzpp and ranking position." },
  { q: "Who is it for?",          detail: "Algerian osu! players who are looking for a different way of engagement or competition." },
  { q: "What makes it different?", detail: "A separate competitive layer built around community challenges. Performance points are converted through challenge plays. DZPP is the site's competitive ranking score; it is separate from the spendable DZP shop currency." },
  { q: "What is the prize?",      detail: "The prize is one month of osu!supporter for the round winner." },
];

const TAKE_ACTIONS = [
  { n: 1, cmd: "Sign up",              note: "Log in with your osu! account" },
  { n: 2, cmd: "Submit a beatmap",     note: "Submit a beatmap challenge of your choice." },
  { n: 3, cmd: "Select a challenge",   note: "Vote for challenges to be the next season community competition." },
  { n: 4, cmd: "Be the one or be there", note: "Submit your plays on the challenge leaderboards and dominate the competition to win, or compete for the ranking." },
];


const STAT_DEFINITIONS = [
  { key: "players", label: "Players", sub: "registered", color: "#88cc44" },
  { key: "submissions", label: "Submissions", sub: "this round", color: "#ffd700" },
  { key: "votes", label: "Votes", sub: "this round", color: "#4499dd" },
  { key: "challenges", label: "Challenges", sub: "completed", color: "#a78bfa" },
  { key: "winners", label: "Winners", sub: "all time", color: "#f472b6" },
] as const;

const ROUGH_EDGES = [
  { label: "Browse / search beatmaps", detail: "Real osu! API search — supports star range, BPM range, sorting, submittable status, favourites, multiple difficulties." },
  { label: "Submit & Vote", detail: "Phase-gated — each action is only available in its designated window." },
  { label: "Play challenges", detail: "Playing a challenge does not require using the challenge requirement to earn engagement dzpp." },
  { label: "Track Ranking", detail: "Ranking is based on dzpp and is sortable by all time, yearly, and seasonally." },
  { label: "Buy Items", detail: "The shop uses DZP, a separate spendable currency. DZPP remains your competitive ranking score." },
  { label: "Archive", detail: "Users can access completed rounds, winner information, challenge leaderboards, and participants." },
];

const FAQ = [
  { q: "Do I need to create an account?",           a: "No new account needed. You sign in directly with your existing osu! account using OAuth." },
  { q: "Does my country need to be set to Algeria?", a: "Yes. Your osu! profile country flag must be Algeria to submit, vote, or play challenges. This is checked automatically on sign-in." },
  { q: "Can I submit any beatmap?",                  a: "The beatmap must have an active leaderboard on the official osu! servers. Unranked or loved maps without leaderboards are not eligible." },
  { q: "What happens if my submission is rejected?", a: "Admins will reject submissions with vague or unclear challenge descriptions. You are free to revise and resubmit during the submission phase." },
  { q: "Can I change my vote after submitting it?",  a: "Yes. You can change your vote at any time before the voting phase closes on the 14th." },
  { q: "Can I vote for my own submission?",          a: "No. Self-voting is not allowed. Your own submission will not appear as a voteable option for you." },
  { q: "What is dzpp?",                              a: "dzpp (DZ Performance Points) is the site's competitive ranking score. Challenge performance contributes to your cumulative ranking; dzpp is not the spendable shop currency." },
  { q: "What is the prize for winning?",             a: "The player whose submission wins the vote receives one month of osu!supporter, gifted directly to their osu! account." },
  { q: "What is the challenge phase?",               a: "After voting closes, the winning beatmap becomes the monthly challenge. Players compete on it using the required mods and challenge type. Submitting any score earns dzpp for engagement; only qualified scores (correct mods + challenge type) compete for placement." },
  { q: "What counts as a Full Combo in a Full Combo challenge?", a: "A Full Combo with zero misses. A single-break (slider-break) does not disqualify you, but a miss does." },
];

const STATUS_LABELS: Record<string, string> = {
  done: "DONE", "in-progress": "IN PROGRESS", "mostly-done": "MOSTLY DONE", upcoming: "UPCOMING",
};

// ── Countdown helpers ─────────────────────────────────────────────────────────
function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return { d, h, min, sec };
}

// ── Animated count-up hook ────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || target === 0) { setVal(target); return; }
    started.current = true;
    const start = performance.now();
    function tick(now: number) {
      const p = Math.min(1, (now - start) / duration);
      setVal(Math.round(p * target));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
}

// ── dzpp tooltip ──────────────────────────────────────────────────────────────
function Dzpp() {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{
        color: "#ffd700", fontWeight: 700,
        borderBottom: "1px dashed rgba(255,215,0,0.5)", cursor: "help",
      }}>dzpp</span>
      {show && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)", background: "#1a2060",
          border: "1px solid rgba(255,215,0,0.3)", borderRadius: "6px",
          padding: "7px 11px", fontSize: "11px", color: "rgba(255,255,255,0.8)",
          whiteSpace: "nowrap", zIndex: 100, pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          lineHeight: 1.5,
        }}>
          <strong style={{ color: "#ffd700" }}>DZ Performance Points</strong><br />
          The site's competitive ranking score — earned through challenges
        </span>
      )}
    </span>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status, color }: { status: string; color: string }) {
  const isDone = status === "done";
  return (
    <span style={{
      background: isDone ? color : `${color}22`, color: isDone ? "#0a1240" : color,
      border: `1px solid ${color}55`, borderRadius: "3px", padding: "2px 7px",
      fontSize: "9px", fontWeight: 800, fontFamily: '"JetBrains Mono", monospace',
      letterSpacing: "0.08em", whiteSpace: "nowrap",
    }}>
      {STATUS_LABELS[status] ?? status.toUpperCase()}
    </span>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
      <span style={{
        fontSize: "10px", fontFamily: '"JetBrains Mono", monospace', fontWeight: 700,
        letterSpacing: "0.14em", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap",
      }}>{label}</span>
      <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.07)" }} />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub: string;
  color: string;
}) {
  const displayed = useCountUp(value);

  return (
    <div
      className="db-stat-card"
      style={{
        padding: "16px",
        borderRadius: "12px",
        border: `1px solid ${color}33`,
      }}
    >
      <div style={{ color, fontSize: "28px", fontWeight: 700 }}>
        {displayed}
      </div>

      <div style={{ fontSize: "12px", opacity: 0.65 }}>
        {sub}
      </div>

      <div style={{ fontSize: "11px", opacity: 0.45 }}>
        {label}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [hoveredPhase, setHoveredPhase] = useState<number | null>(null);
  const [openFaq, setOpenFaq]           = useState<number | null>(null);
  const [timeLeft, setTimeLeft]         = useState(fmtTime(0));
  const [phaseLabel, setPhaseLabel]     = useState("");
  const [round, setRound]               = useState<ApiRound | null>(null);
  const [roundLoaded, setRoundLoaded] = useState(false);
  const [roundLoadError, setRoundLoadError] = useState(false);
  const [archiveRounds, setArchiveRounds] = useState<ApiRoundDetail[]>([]);
  const [archiveLoaded, setArchiveLoaded] = useState(false);

const [stats, setStats] = useState({
  players: 0,
  submissions: 0,
  votes: 0,
  challenges: 0,
  winners: 0,
});

  // The landing page must use the server's actual round schedule. The old implementation
  // inferred phases from the calendar, which becomes wrong as soon as an administrator
  // advances or extends a phase.
  useEffect(() => {
    let cancelled = false;

    void api.rounds.current().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setRound(result.data);
        setRoundLoadError(false);
      } else {
        setRound(null);
        setRoundLoadError(true);
      }
      setRoundLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api.rounds.list().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setArchiveRounds(result.data.filter((item) => item.phase === "ended").slice(0, 5));
      }
      setArchiveLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Countdown tick
  useEffect(() => {
    function tick() {
      if (!roundLoaded) return;

      const phaseEndsAt = round?.phase === "submission"
        ? round.submissionEndsAt
        : round?.phase === "voting"
          ? round.votingEndsAt
          : round?.phase === "challenge"
            ? round.challengeEndsAt
            : null;

      const label = round?.phase === "submission"
        ? "SUBMISSION PHASE"
        : round?.phase === "voting"
          ? "VOTING PHASE"
          : round?.phase === "challenge"
            ? "CHALLENGE PHASE"
            : "NO ACTIVE PHASE";

      setPhaseLabel(label);
      setTimeLeft(phaseEndsAt ? fmtTime(new Date(phaseEndsAt).getTime() - Date.now()) : fmtTime(0));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [round, roundLoaded]);

useEffect(() => {
  let cancelled = false;

  void api.stats.get().then((result) => {
    if (cancelled || !result.ok) return;
    setStats(result.data);
  });

  return () => {
    cancelled = true;
  };
}, []);

  const { d, h, min, sec } = timeLeft;
  const activePhaseId = round?.phase === "submission"
    ? 1
    : round?.phase === "voting"
      ? 2
      : round?.phase === "challenge"
        ? 3
        : null;

  return (
    <div style={{
      background: "linear-gradient(150deg, #0c1755 0%, #090f38 45%, #0d1858 100%)",
      minHeight: "100vh", color: "white", fontFamily: '"Exo 2", sans-serif',
      position: "relative", overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;900&family=JetBrains+Mono:wght@400;700;800&display=swap');

        * { box-sizing: border-box; }

        .db-stats   { grid-template-columns: repeat(6, 1fr); }
        .db-2col    { grid-template-columns: 1fr 1fr; }
        .db-phases  { grid-template-columns: repeat(4, 1fr); }
        .db-phase4  { grid-template-columns: repeat(4, 1fr); }
        .db-edges   { grid-template-columns: repeat(3, 1fr); }
        .db-archive-row { grid-template-columns: 0.7fr 2fr 1.3fr 0.8fr; }

        @media (max-width: 1100px) {
          .db-stats  { grid-template-columns: repeat(3, 1fr); }
          .db-phases { grid-template-columns: repeat(2, 1fr); }
          .db-phase4 { grid-template-columns: repeat(2, 1fr); }
          .db-edges  { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 680px) {
          .db-stats  { grid-template-columns: repeat(2, 1fr); }
          .db-2col   { grid-template-columns: 1fr; }
          .db-phases { grid-template-columns: 1fr; }
          .db-phase4 { grid-template-columns: 1fr; }
          .db-edges  { grid-template-columns: 1fr; }
          .db-archive-row { grid-template-columns: 0.6fr 2fr 0.8fr; }
          .db-archive-row > :nth-child(3) { display: none; }
        }

        .faq-row { transition: background 0.15s; }
        .faq-row:hover { background: rgba(255,255,255,0.025) !important; }
        .phase-card { transition: box-shadow 0.2s, transform 0.15s; }
      `}</style>

      {/* Triangle background */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <svg width="100%" height="100%" viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
          {TRIANGLES.map((t, i) => {
            const s = t.size, h = s * 0.866;
            const pts = t.flip ? `${s/2},0 ${s},${h} 0,${h}` : `0,0 ${s},0 ${s/2},${h}`;
            return <polygon key={i} points={pts} fill="none" stroke={`rgba(255,255,255,${t.opacity})`} strokeWidth="1.2" transform={`translate(${t.x},${t.y})`} />;
          })}
        </svg>
      </div>

      {/* ── Sticky round-status banner ────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(9,15,56,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,165,0,0.2)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "10px", padding: "9px 24px",
      }}>
        {/* Left — phase status */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%", background: "#ff9500",
            boxShadow: "0 0 8px #ff9500", display: "inline-block", flexShrink: 0,
          }} />
          <span style={{ fontSize: "11px", fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', color: "#ff9500", letterSpacing: "0.08em" }}>
            {roundLoaded
              ? roundLoadError
                ? "ROUND STATUS UNAVAILABLE"
                : round
                  ? phaseLabel + " OPEN"
                  : "NO ACTIVE ROUND"
              : "LOADING ROUND STATUS"}
          </span>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", fontFamily: '"JetBrains Mono", monospace' }}>
            — closes in
          </span>
        </div>

        {/* Centre — countdown */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {[
            { v: d,   u: "D" },
            { v: h,   u: "H" },
            { v: min, u: "M" },
            { v: sec, u: "S" },
          ].map(({ v, u }, i) => (
            <span key={u} style={{ display: "flex", alignItems: "baseline", gap: "2px" }}>
              {i > 0 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "12px", marginRight: "4px" }}>:</span>}
              <span style={{
                fontFamily: '"JetBrains Mono", monospace', fontWeight: 900,
                fontSize: "18px", color: "white", minWidth: "26px", textAlign: "center",
                lineHeight: 1,
              }}>
                {String(v).padStart(2, "0")}
              </span>
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.08em" }}>
                {u}
              </span>
            </span>
          ))}
        </div>

        {/* Right — CTA */}
        <a href="/submit" aria-disabled={!round || round.phase !== "submission"} style={{
          background: !round || round.phase !== "submission" ? "rgba(255,255,255,0.08)" : "#ff9500", color: !round || round.phase !== "submission" ? "rgba(255,255,255,0.35)" : "#0a1240", borderRadius: "4px",
          padding: "5px 14px", fontSize: "11px", fontWeight: 900,
          fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.06em",
          textDecoration: "none", whiteSpace: "nowrap",
        }}>
          {round?.phase === "submission" ? "Submit now →" : "Submission closed"}
        </a>
      </div>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: "1360px", margin: "0 auto", padding: "0 24px 64px" }}>

        {/* ── Header ── */}
        <header style={{
          padding: "26px 0 22px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          marginBottom: "22px", display: "flex", alignItems: "center",
          justifyContent: "space-between", flexWrap: "wrap", gap: "12px",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "5px" }}>
              <span style={{ fontSize: "22px", lineHeight: 1 }}>🎵</span>
              <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1 }}>
                osu!<span style={{ color: "#ffd700" }}>dz</span>
              </h1>
              <span style={{
                borderRadius: "4px", padding: "3px 1px", fontSize: "10px",
                fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.1em",
                color: "#ffd700", fontWeight: 700,
              }}>pp</span>
            </div>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.4)", fontSize: "12px", fontFamily: '"JetBrains Mono", monospace' }}>
              Seasonal Beatmap Bounty · Algerian osu! community · Live round data
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* Discord button */}
            <a href="https://discord.gg/your-invite" target="_blank" rel="noreferrer" style={{
              display: "flex", alignItems: "center", gap: "7px",
              background: "rgba(88,101,242,0.18)", border: "1px solid rgba(88,101,242,0.4)",
              borderRadius: "6px", padding: "7px 14px", textDecoration: "none",
              color: "#a5b4fc", fontSize: "12px", fontWeight: 700,
              fontFamily: '"JetBrains Mono", monospace",',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
              </svg>
              Discord
            </a>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.1em", marginBottom: "2px" }}>
                LAST UPDATED
              </div>
              <div style={{ fontSize: "17px", fontFamily: '"JetBrains Mono", monospace', color: "#88cc44", fontWeight: 700 }}>
                {round ? `${round.month} ${round.year}` : "—"}
              </div>
              <div style={{ fontSize: "10px", color: "rgba(136,204,68,0.6)", fontFamily: '"JetBrains Mono", monospace', marginTop: "2px" }}>
                {round ? `Round ${round.roundNumber} · live` : "Round status unavailable"}
              </div>
            </div>
          </div>
        </header>

        {/* ── Stats strip (animated count-up) ── */}
      <div className="db-stats" style={{ display: "grid", gap: "10px", marginBottom: "20px" }}>
  {STAT_DEFINITIONS.map((definition) => (
    <StatCard
      key={definition.key}
      label={definition.label}
      value={stats[definition.key]}
      sub={definition.sub}
      color={definition.color}
    />
  ))}
</div>

        {/* ── Take Actions + About ── */}
        <div className="db-2col" style={{ display: "grid", gap: "14px", marginBottom: "24px" }}>

          {/* Take Actions — visual stepper */}
          <div style={{
            background: "rgba(10,16,60,0.65)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,215,0,0.22)", borderLeft: "3px solid #ffd700",
            borderRadius: "8px", padding: "18px 20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <span style={{ color: "#ffd700", fontFamily: '"JetBrains Mono", monospace', fontSize: "13px", fontWeight: 800, letterSpacing: "0.06em" }}>
                ⚡ TAKE ACTIONS
              </span>
              <span style={{
                background: "#ffd700", color: "#0a1240", borderRadius: "3px",
                padding: "1px 7px", fontSize: "9px", fontWeight: 900,
                fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.08em",
              }}>IN ORDER</span>
            </div>

            {/* Stepper */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {TAKE_ACTIONS.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: "0", alignItems: "stretch" }}>
                  {/* Connector column */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "32px", flexShrink: 0 }}>
                    <div style={{
                      width: "28px", height: "28px", borderRadius: "50%",
                      background: "rgba(255,215,0,0.12)", border: "2px solid rgba(255,215,0,0.5)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: 900, color: "#ffd700",
                      fontFamily: '"JetBrains Mono", monospace', flexShrink: 0, zIndex: 1,
                    }}>{a.n}</div>
                    {i < TAKE_ACTIONS.length - 1 && (
                      <div style={{ width: "2px", flex: 1, background: "rgba(255,215,0,0.15)", minHeight: "20px" }} />
                    )}
                  </div>
                  {/* Content */}
                  <div style={{ paddingLeft: "12px", paddingBottom: i < TAKE_ACTIONS.length - 1 ? "18px" : "0", paddingTop: "4px" }}>
                    <div style={{
                      background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)",
                      borderRadius: "4px", padding: "3px 10px", display: "inline-block",
                      fontSize: "12px", fontWeight: 700, color: "#ffd700",
                      fontFamily: '"JetBrains Mono", monospace', marginBottom: "5px",
                    }}>{a.cmd}</div>
                    <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>{a.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* About osu!dzpp */}
          <div style={{
            background: "rgba(10,16,60,0.65)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(167,139,250,0.22)", borderLeft: "3px solid #a78bfa",
            borderRadius: "8px", padding: "18px 20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "15px" }}>
              <span style={{ color: "#a78bfa", fontFamily: '"JetBrains Mono", monospace', fontSize: "13px", fontWeight: 800, letterSpacing: "0.06em" }}>
                ◆ ABOUT osu!dzpp
              </span>
              <span style={{
                background: "#a78bfa", color: "white", borderRadius: "3px",
                padding: "1px 7px", fontSize: "9px", fontWeight: 900,
                fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.08em",
              }}>FAQ</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {OSU_DZPP.map((oq, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ color: "#a78bfa", fontSize: "15px", lineHeight: "1.4", minWidth: "16px", fontWeight: 700 }}>?</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "13px", color: "rgba(255,255,255,0.9)", marginBottom: "3px" }}>{oq.q}</div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", lineHeight: 1.55 }}>
                      {/* Replace "dzpp" with tooltip version */}
                      {oq.detail.split(/(dzpp)/gi).map((part, pi) =>
                        /^dzpp$/i.test(part) ? <Dzpp key={pi} /> : part
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Phase timeline indicator ── */}
        <SectionDivider label="OSUDZ PHASES" />
        <div style={{
          background: "rgba(8,13,50,0.6)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "8px", padding: "14px 20px", marginBottom: "14px",
          display: "flex", alignItems: "center", gap: "0", overflow: "hidden",
        }}>
          {PHASES.map((phase, i) => (
            <div key={phase.id} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", flex: "none" }}>
                <div style={{
                  width: phase.active ? "14px" : "10px",
                  height: phase.active ? "14px" : "10px",
                  borderRadius: "50%",
                  background: phase.active ? phase.color : `${phase.color}44`,
                  border: `2px solid ${phase.color}`,
                  boxShadow: phase.active ? `0 0 12px ${phase.color}` : "none",
                  transition: "all 0.2s",
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: "9px", fontFamily: '"JetBrains Mono", monospace',
                  color: phase.active ? phase.color : "rgba(255,255,255,0.3)",
                  fontWeight: phase.active ? 800 : 400, letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}>
                  {phase.active ? "● " : ""}{phase.label}
                </span>
                <span style={{
                  fontSize: "8px", color: phase.active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)",
                  fontFamily: '"JetBrains Mono", monospace', whiteSpace: "nowrap",
                }}>
                  {phase.title}
                </span>
              </div>
              {i < PHASES.length - 1 && (
                <div style={{
                  flex: 1, height: "2px",
                  background: i < PHASES.findIndex(p => p.active)
                    ? `linear-gradient(90deg, ${PHASES[i].color}88, ${PHASES[i+1].color}44)`
                    : "rgba(255,255,255,0.07)",
                  margin: "0 4px", marginTop: "-18px",
                }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Phase cards ── */}
        <div className="db-phases" style={{ display: "grid", gap: "14px", marginBottom: "20px" }}>
          {PHASES.map((phase) => {
            const isActive = phase.id === activePhaseId;
            const status = phase.id === 0
              ? "in-progress"
              : activePhaseId === null
                ? "upcoming"
                : activePhaseId === phase.id
                  ? "in-progress"
                  : phase.id < activePhaseId
                    ? "done"
                    : "upcoming";
            const viewPhase = { ...phase, active: isActive, status: status as Phase["status"] };
            const isHovered = hoveredPhase === phase.id;
            return (
              <div
                key={viewPhase.id}
                className="phase-card"
                onMouseEnter={() => setHoveredPhase(phase.id)}
                onMouseLeave={() => setHoveredPhase(null)}
                style={{
                  background: "rgba(8,13,50,0.78)", backdropFilter: "blur(10px)",
                  borderLeft: `1px solid ${viewPhase.color}${viewPhase.active ? "55" : "28"}`,
                  borderRight: `1px solid ${viewPhase.color}${viewPhase.active ? "55" : "28"}`,
                  borderBottom: `1px solid ${viewPhase.color}${viewPhase.active ? "55" : "28"}`,
                  borderTop: `3px solid ${viewPhase.color}`,
                  borderRadius: "8px", padding: "16px",
                  display: "flex", flexDirection: "column",
                  boxShadow: viewPhase.active
                    ? `0 0 20px ${viewPhase.color}20, 0 2px 10px rgba(0,0,0,0.3)`
                    : isHovered
                      ? `0 6px 28px ${viewPhase.color}25`
                      : `0 2px 10px rgba(0,0,0,0.3)`,
                  transform: isHovered ? "translateY(-2px)" : "none",
                  cursor: "default",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "9px" }}>
                  <div>
                    <div style={{ fontSize: "9px", color: phase.color, fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, letterSpacing: "0.14em", marginBottom: "3px" }}>
                      {viewPhase.label}{viewPhase.active ? " · NOW" : ""}
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, lineHeight: 1.25 }}>{viewPhase.title}</div>
                  </div>
                  <StatusBadge status={viewPhase.status} color={viewPhase.color} />
                </div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", fontFamily: '"JetBrains Mono", monospace', marginBottom: "12px" }}>
                  {viewPhase.dates}
                </div>
                {/* Day-based progress bar */}
                {viewPhase.totalDays > 0 ? (() => {
                  const today = new Date().getDate();
                  const rawPct = viewPhase.active
                    ? Math.min(100, Math.max(0, Math.round(((today - viewPhase.startDay) / viewPhase.totalDays) * 100)))
                    : viewPhase.status === "done" ? 100 : 0;
                  const daysElapsed = viewPhase.active ? Math.max(0, today - viewPhase.startDay) : (rawPct === 100 ? viewPhase.totalDays : 0);
                  const daysLeft = viewPhase.active ? Math.max(0, viewPhase.endDay - today + 1) : (rawPct === 0 ? viewPhase.totalDays : 0);
                  return (
                    <div style={{ marginBottom: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", alignItems: "flex-end" }}>
                        <div style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.38)", fontFamily: '"JetBrains Mono", monospace' }}>
                            {viewPhase.active ? `day ${daysElapsed + 1} of ${viewPhase.totalDays}` : rawPct === 0 ? `${viewPhase.totalDays} days` : "complete"}
                          </span>
                          {viewPhase.active && daysLeft > 0 && (
                            <span style={{ fontSize: "9px", color: `${viewPhase.color}bb`, fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}>
                              {daysLeft}d left
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: "11px", color: phase.color, fontFamily: '"JetBrains Mono", monospace', fontWeight: 800 }}>
                          {rawPct}%
                        </span>
                      </div>
                      {/* Segmented day bar */}
                      <div style={{ display: "flex", gap: "2px" }}>
                        {Array.from({ length: phase.totalDays }).map((_, di) => {
                          const filled = phase.active
                            ? di < daysElapsed
                            : rawPct === 100;
                          const isCurrent = phase.active && di === daysElapsed;
                          return (
                            <div
                              key={di}
                              style={{
                            flex: 1, height: "5px", borderRadius: "2px",
                            background: filled
                                  ? viewPhase.color
                                    : isCurrent
                                    ? `${viewPhase.color}66`
                                    : "rgba(255,255,255,0.07)",
                                boxShadow: filled ? `0 0 4px ${viewPhase.color}60` : isCurrent ? `0 0 6px ${viewPhase.color}80` : "none",
                                transition: "background 0.3s",
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })() : (
                  /* Phase 0 — no time window, show eligibility indicator */
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.38)", fontFamily: '"JetBrains Mono", monospace' }}>eligibility check</span>
                      <span style={{ fontSize: "11px", color: phase.color, fontFamily: '"JetBrains Mono", monospace', fontWeight: 800 }}>ongoing</span>
                    </div>
                    <div style={{ height: "5px", borderRadius: "2px", background: `linear-gradient(90deg, ${viewPhase.color}, ${viewPhase.color}44)`, boxShadow: `0 0 8px ${viewPhase.color}50` }} />
                  </div>
                )}
                {/* Description */}
                <div style={{ flex: 1, fontSize: "11px", color: "rgba(255,255,255,0.48)", lineHeight: 1.65, marginBottom: "13px" }}>
                  {viewPhase.desc.split(/(dzpp)/gi).map((part, pi) =>
                    /^dzpp$/i.test(part) ? <Dzpp key={pi} /> : part
                  )}
                </div>
                {/* Done when */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${viewPhase.color}18`, borderLeft: `2px solid ${viewPhase.color}55`, borderRadius: "4px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "9px", color: viewPhase.color, fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.12em", fontWeight: 800, marginBottom: "4px" }}>DONE WHEN</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.42)", lineHeight: 1.55 }}>{viewPhase.doneWhen}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Important Matters ── */}
        <SectionDivider label="IMPORTANT MATTERS" />
        <div style={{
          background: "rgba(8,13,50,0.75)", backdropFilter: "blur(10px)",
          borderLeft: "1px solid rgba(167,139,250,0.22)", borderRight: "1px solid rgba(167,139,250,0.22)", borderBottom: "1px solid rgba(167,139,250,0.22)", borderTop: "3px solid #a78bfa",
          borderRadius: "8px", padding: "18px 20px", marginBottom: "20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "15px" }}>
            <div>
              <div style={{ fontSize: "9px", color: "#a78bfa", fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, letterSpacing: "0.14em", marginBottom: "2px" }}>RULES</div>
              <div style={{ fontSize: "15px", fontWeight: 700 }}>Important Matters</div>
            </div>
            <span style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: "2px", padding: "2px 8px", fontSize: "8px", color: "#c4b5fd", fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, letterSpacing: "0.08em" }}>
              Are YOU
            </span>
          </div>
          <div className="db-phase4" style={{ display: "grid", gap: "11px" }}>
            {PHASE4.map((item, i) => (
              <div key={i} style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.14)", borderRadius: "6px", padding: "14px 16px" }}>
                <div style={{ fontSize: "22px", marginBottom: "8px" }}>{item.emoji}</div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "#c4b5fd", marginBottom: "5px" }}>{item.title}</div>
                <ul style={{ margin: 0, paddingLeft: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "5px" }}>
                  {item.bullets.map((b, bi) => (
                    <li key={bi} style={{ fontSize: "11px", color: "rgba(255,255,255,0.38)", lineHeight: 1.55, display: "flex", gap: "6px", alignItems: "flex-start" }}>
                      <span style={{ color: "#a78bfa", minWidth: "8px", marginTop: "1px" }}>·</span>
                      {b.split(/(dzpp)/gi).map((part, pi) =>
                        /^dzpp$/i.test(part) ? <Dzpp key={pi} /> : part
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── What Users Can Do ── */}
        <SectionDivider label="WHAT USERS CAN DO — Explore" />
        <div style={{ background: "rgba(8,13,50,0.6)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "16px 20px" }}>
          <div className="db-edges" style={{ display: "grid", gap: "13px" }}>
            {ROUGH_EDGES.map((edge, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <span style={{ color: "rgba(68,153,221,0.7)", fontSize: "12px", lineHeight: "1.45", minWidth: "14px" }}>✦</span>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: "3px" }}>{edge.label}</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", lineHeight: 1.55 }}>
                    {edge.detail.split(/(dzpp)/gi).map((part, pi) =>
                      /^dzpp$/i.test(part) ? <Dzpp key={pi} /> : part
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Beyond the Monthly Round ── */}
        <div style={{ marginTop: "24px" }}>
          <SectionDivider label="BEYOND THE MONTHLY ROUND" />
          <div className="db-edges" style={{ display: "grid", gap: "13px" }}>
            {[
              {
                label: "DZPP — Competitive Ranking",
                detail: "DZPP is your permanent osu!DZ ranking score. Challenge performance, completion, qualification, and placement contribute to it; it is not spendable.",
                color: "#ffd700",
              },
              {
                label: "DZP — Spendable Currency",
                detail: "DZP is the shop currency. You earn it from platform participation and spend it on cosmetics such as titles, badges, frames, username decorations, and profile decorations.",
                color: "#88cc44",
              },
              {
                label: "Profiles & Rankings",
                detail: "Player profiles bring together DZ rank, DZPP, challenge history, top plays, progression, collections, and activity. Rankings let you compare players across the platform.",
                color: "#4499dd",
              },
              {
                label: "Duels",
                detail: "Duels are a separate head-to-head competition. They use their own 24-hour rules, stakes, and balance ledger, without changing your monthly DZPP history.",
                color: "#a78bfa",
              },
            ].map((item) => (
              <div key={item.label} style={{
                background: "rgba(8,13,50,0.75)", backdropFilter: "blur(8px)",
                border: `1px solid ${item.color}22`, borderLeft: `3px solid ${item.color}`,
                borderRadius: "7px", padding: "15px 16px",
              }}>
                <div style={{ fontSize: "12px", fontWeight: 800, color: item.color, marginBottom: "6px" }}>
                  {item.label}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", lineHeight: 1.65 }}>
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Archive ── */}
        <div style={{ marginTop: "24px" }}>
          <SectionDivider label="ARCHIVE" />
          <div style={{
            background: "rgba(8,13,50,0.6)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "8px", overflow: "hidden",
          }}>
            {!archiveLoaded ? (
              <div style={{ padding: "28px 20px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "11px", fontFamily: '"JetBrains Mono", monospace' }}>
                Loading completed rounds…
              </div>
            ) : archiveRounds.length === 0 ? (
              <div style={{ padding: "36px 20px", textAlign: "center" }}>
                <div style={{ fontSize: "28px", marginBottom: "10px" }}>🏆</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: "6px" }}>
                  No completed rounds yet
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", fontFamily: '"JetBrains Mono", monospace' }}>
                  Completed rounds will appear here automatically.
                </div>
              </div>
            ) : (
              <>
                <div className="db-archive-row" style={{ display: "grid", padding: "10px 20px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Round", "Winning Beatmap", "Submitted by", "Players"].map(h => (
                    <div key={h} style={{ fontSize: "9px", fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)" }}>{h}</div>
                  ))}
                </div>
                {archiveRounds.map((item) => (
                  <a key={item.id} href="/archive" className="db-archive-row" style={{ display: "grid", padding: "13px 20px", textDecoration: "none", color: "inherit", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: "11px", fontFamily: '"JetBrains Mono", monospace', color: "#ffd700", fontWeight: 800 }}>#{item.roundNumber}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.78)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.winner?.title ?? "No recorded winner"}
                      </span>
                      <span style={{ display: "block", fontSize: "9px", color: "rgba(255,255,255,0.3)", fontFamily: '"JetBrains Mono", monospace' }}>
                        {item.month} {item.year}{item.totalVotes !== null ? ` · ${item.totalVotes} votes` : ""}
                      </span>
                    </span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.winner?.submittedByName ?? "—"}
                    </span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", fontFamily: '"JetBrains Mono", monospace' }}>
                      {item.participants}
                    </span>
                  </a>
                ))}
                <div style={{ padding: "12px 20px", textAlign: "right" }}>
                  <a href="/archive" style={{ color: "#4499dd", fontSize: "10px", fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, textDecoration: "none" }}>
                    View full archive →
                  </a>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Common Questions ── */}
        <div style={{ marginTop: "24px" }}>
          <SectionDivider label="COMMON QUESTIONS" />
          <div style={{ background: "rgba(8,13,50,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", overflow: "hidden" }}>
            {FAQ.map((item, i) => (
              <div
                key={i}
                className="faq-row"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  borderBottom: i < FAQ.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  cursor: "pointer",
                  background: openFaq === i ? "rgba(255,255,255,0.03)" : "transparent",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", padding: "14px 20px" }}>
                  <span style={{
                    fontSize: "13px", fontWeight: 600, lineHeight: 1.4,
                    color: openFaq === i ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.62)",
                    transition: "color 0.15s",
                  }}>
                    {item.q}
                  </span>
                  <span style={{
                    fontSize: "18px", color: "#ffd700", fontWeight: 300, lineHeight: 1,
                    minWidth: "18px", textAlign: "center", display: "inline-block",
                    transform: openFaq === i ? "rotate(45deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}>+</span>
                </div>
                {openFaq === i && (
                  <div style={{
                    margin: "0 20px 16px 36px", fontSize: "12px",
                    color: "rgba(255,255,255,0.45)", lineHeight: 1.7,
                    borderLeft: "2px solid rgba(255,215,0,0.3)", paddingLeft: "14px",
                  }}>
                    {item.a.split(/(dzpp)/gi).map((part, pi) =>
                      /^dzpp$/i.test(part) ? <Dzpp key={pi} /> : part
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          marginTop: "32px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: "8px",
        }}>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.22)", fontFamily: '"JetBrains Mono", monospace' }}>
            osu!dz · Challenges created by Heaki · 2024-10-27, updated 2026-09-14
          </span>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.22)", fontFamily: '"JetBrains Mono", monospace' }}>
            ! = required · ✓ = done · ○ = pending
          </span>
        </div>

      </div>
    </div>
  );
}
