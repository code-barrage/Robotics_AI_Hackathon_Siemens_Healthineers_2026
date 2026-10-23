import { useEffect, useRef } from "react";
import { MdCheck, MdMyLocation, MdFlag, MdDirectionsRun } from "../../icons";

export interface WorkflowStep {
  event: string;
  receivedAt: string;
  confirmed: boolean;
  currentLocation?: string;
  nextLocation?: string;
}

interface Props {
  steps: WorkflowStep[];
}

const STYLE_ID = "wf-timeline-styles";
const CSS = `
@keyframes wf-travel-h { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
@keyframes wf-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(236,102,2,0.5); } 50% { box-shadow: 0 0 0 8px rgba(236,102,2,0); } }
@keyframes wf-loc-slide { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes wf-arrow-bounce { 0%,100% { transform: translateX(0); } 50% { transform: translateX(5px); } }
.wf-active-dot   { animation: wf-pulse 1.5s ease-in-out infinite; }
.wf-loc-card     { animation: wf-loc-slide 0.3s ease-out both; }
.wf-arrow-bounce { display:inline-block; animation: wf-arrow-bounce 0.7s ease-in-out infinite; }
`;

function injectStyles() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }
}

function fmt(raw: string) {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function LocationCard({ step, isActive }: { step: WorkflowStep; isActive: boolean }) {
  const { currentLocation: cur, nextLocation: nxt, confirmed } = step;
  if (!cur && !nxt) return null;

  if (isActive && cur && nxt) {
    return (
      <div className="wf-loc-card" style={{
        display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8,
        background: "var(--brand-50)", border: "1px solid var(--brand-100)",
        borderRadius: 8, padding: "5px 10px", fontSize: "var(--fs-xs)", whiteSpace: "nowrap",
      }}>
        <MdMyLocation size={12} style={{ color: "var(--brand)", flexShrink: 0 }} />
        <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{fmt(cur)}</span>
        <span className="wf-arrow-bounce" style={{ color: "var(--brand)", fontWeight: 700 }}>→</span>
        <MdFlag size={12} style={{ color: "var(--brand-active)", flexShrink: 0 }} />
        <span style={{ color: "var(--brand-active)", fontWeight: 600 }}>{fmt(nxt)}</span>
        <MdDirectionsRun size={12} style={{ color: "var(--brand)", marginLeft: 2 }} />
      </div>
    );
  }

  if (confirmed && (nxt || cur)) {
    return (
      <div className="wf-loc-card" style={{
        display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8,
        background: "var(--success-bg)", border: "1px solid var(--success-border)",
        borderRadius: 8, padding: "3px 8px", fontSize: "var(--fs-xs)", whiteSpace: "nowrap",
      }}>
        <MdCheck size={11} style={{ color: "var(--success)" }} />
        <span style={{ color: "var(--success)" }}>Reached <strong>{fmt(nxt ?? cur!)}</strong></span>
      </div>
    );
  }

  if (cur) {
    return (
      <div className="wf-loc-card" style={{
        display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8,
        background: "var(--brand-50)", border: "1px solid var(--brand-100)",
        borderRadius: 8, padding: "3px 8px", fontSize: "var(--fs-xs)", whiteSpace: "nowrap",
      }}>
        <MdMyLocation size={11} style={{ color: "var(--brand)" }} />
        <span style={{ color: "var(--text-secondary)" }}>At <strong>{fmt(cur)}</strong></span>
      </div>
    );
  }
  return null;
}

export default function WorkflowTimeline({ steps }: Props) {
  const rightRef = useRef<HTMLDivElement>(null);
  useEffect(() => { injectStyles(); }, []);
  useEffect(() => {
    rightRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "end" });
  }, [steps.length]);

  if (steps.length === 0) {
    return <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)", margin: 0 }}>
      Waiting for workflow events…
    </p>;
  }

  return (
    <div style={{ overflowX: "auto", paddingBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-start", minWidth: "max-content", padding: "4px 2px 0" }}>
        {steps.map((step, i) => {
          const isLast   = i === steps.length - 1;
          const isDone   = step.confirmed;
          const isActive = isLast && !isDone;
          const STEP_W   = 90;
          const LINE_W   = 48;

          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: STEP_W }}>
                <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div
                    className={isActive ? "wf-active-dot" : ""}
                    style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isDone ? "var(--success)"
                              : isActive ? "var(--brand)"
                              : "var(--neutral-300)",
                      border: `2px solid ${isDone ? "var(--success)" : isActive ? "var(--brand)" : "var(--neutral-300)"}`,
                      transition: "all 0.4s", zIndex: 1,
                    }}
                  >
                    {isDone && <MdCheck size={12} color="#fff" />}
                  </div>
                </div>
                <div style={{
                  marginTop: 8, textAlign: "center", padding: "0 4px",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: isActive ? "var(--fs-sm)" : "var(--fs-xs)",
                  color: isDone ? "var(--text-muted)" : isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  lineHeight: 1.3,
                }}>
                  {fmt(step.event)}
                </div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 3, textAlign: "center" }}>
                  {new Date(step.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
                {(isActive || isDone) && <LocationCard step={step} isActive={isActive} />}
              </div>

              {!isLast && (
                <div style={{
                  position: "relative", height: 2, width: LINE_W, flexShrink: 0,
                  background: "var(--neutral-200)", overflow: "hidden", marginTop: 10,
                }}>
                  {isDone ? (
                    <div style={{ position: "absolute", inset: 0, background: "var(--success)" }} />
                  ) : (
                    <div style={{
                      position: "absolute", top: 0, height: "100%", width: "50%",
                      background: "linear-gradient(to right, transparent, var(--brand), transparent)",
                      animation: "wf-travel-h 1.2s linear infinite",
                    }} />
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={rightRef} />
      </div>
    </div>
  );
}
