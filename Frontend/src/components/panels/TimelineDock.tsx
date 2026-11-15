import { useEffect } from "react";
import { DAY, DELAYS, useStore, WINDOW_DAYS } from "../../state/store";
import { useSiteSky } from "../../state/hooks";
import { fmtUTC } from "../../lib/timeline";
import { VisibilityLanes } from "../charts/VisibilityLanes";
import { CombinedStrip, StripLegend } from "../charts/CombinedStrip";
import { PauseIcon, PlayIcon } from "../icons";
import { shortName } from "../globe/GlobeOverlay";

const SPEEDS = [
  { v: 1, label: "1 h/s" },
  { v: 6, label: "6 h/s" },
  { v: 24, label: "1 d/s" },
  { v: 72, label: "3 d/s" },
];

function PlayButton() {
  const playing = useStore((s) => s.playing);
  const time = useStore((s) => s.time);
  const missionStart = useStore((s) => s.missionStart);
  const { setTime, setPlaying } = useStore.getState();
  const start = Date.parse(missionStart);
  const end = start + WINDOW_DAYS * DAY;
  return (
    <button
      className="btn btn--round btn--primary"
      onClick={() => {
        if (!playing && time >= end) setTime(start);
        setPlaying(!playing);
      }}
      aria-label={playing ? "Pause" : "Play"}
      title={playing ? "Pause (space)" : "Play (space)"}
    >
      {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
    </button>
  );
}

function DiscoverDock() {
  const time = useStore((s) => s.time);
  const missionStart = useStore((s) => s.missionStart);
  const delayDays = useStore((s) => s.delayDays);
  const sites = useStore((s) => s.sites);
  const selectedId = useStore((s) => s.selectedSiteId);
  const { setDelay, setTime, setSpeed } = useStore.getState();
  const siteId = selectedId ?? sites[0]?.id;
  const site = sites.find((s) => s.id === siteId);
  const { analysis } = useSiteSky(siteId);
  const day = Math.floor((time - Date.parse(missionStart)) / DAY) + 1;

  // The casual layer plays at one lunar-surface day per second.
  useEffect(() => setSpeed(24), [setSpeed]);

  return (
    <div className="dock dock--discover glass">
      <div className="dock__controls">
        <PlayButton />
        <div className="dock__clock">
          <div className="dock__time">
            Day {Math.min(day, WINDOW_DAYS)} <span className="muted">of {WINDOW_DAYS} after landing</span>
          </div>
          <div className="dock__met">{site ? `at ${shortName(site)}` : "Pick a site"}</div>
        </div>
        <div className="dock__spacer" />
        <button
          className={`chip chip--toggle ${delayDays === 7 ? "is-on" : ""}`}
          aria-pressed={delayDays === 7}
          onClick={() => setDelay(delayDays === 7 ? 0 : 7)}
          title="See what happens if the landing slips by a week"
        >
          {delayDays === 7 ? "✓ Landing a week late" : "What if we land a week late?"}
        </button>
      </div>
      <div className="dock__strip">
        <CombinedStrip analysis={analysis} time={time} onScrub={setTime} label={site ? shortName(site) : undefined} />
        <StripLegend />
      </div>
    </div>
  );
}

function PlannerDock() {
  const time = useStore((s) => s.time);
  const speed = useStore((s) => s.speed);
  const missionStart = useStore((s) => s.missionStart);
  const baseStart = useStore((s) => s.baseStart);
  const delayDays = useStore((s) => s.delayDays);
  const sites = useStore((s) => s.sites);
  const selectedId = useStore((s) => s.selectedSiteId);
  const { setTime, setSpeed, setBaseStart, setDelay } = useStore.getState();

  const siteId = selectedId ?? sites[0]?.id;
  const site = sites.find((s) => s.id === siteId);
  const { analysis, status } = useSiteSky(siteId);

  const start = Date.parse(missionStart);
  const end = start + WINDOW_DAYS * DAY;
  const elapsed = time - start;

  return (
    <div className="dock glass">
      <div className="dock__controls">
        <PlayButton />
        <div className="dock__clock">
          <div className="dock__time mono">{fmtUTC(time)}</div>
          <div className="dock__met">
            T+{Math.floor(elapsed / DAY)}d {String(Math.floor((elapsed % DAY) / 3.6e6)).padStart(2, "0")}h after landing{site ? ` · ${shortName(site)}` : ""}
          </div>
        </div>
        <div className="seg" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button key={s.v} aria-pressed={speed === s.v} className={speed === s.v ? "seg__btn active" : "seg__btn"} onClick={() => setSpeed(s.v)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="dock__spacer" />
        <label className="field">
          <span>Landing date</span>
          <input type="date" value={baseStart.slice(0, 10)} onChange={(e) => e.target.value && setBaseStart(`${e.target.value}T00:00:00Z`)} />
        </label>
        <div className="delay" role="group" aria-label="Delay from the original landing date">
          <span className="delay__label">Delay</span>
          {[0, ...DELAYS].map((d) => (
            <button
              key={d}
              aria-pressed={delayDays === d}
              className={`chip ${delayDays === d ? "chip--active" : ""}`}
              onClick={() => setDelay(d)}
              title={d ? `Land ${d} days after the original date` : "Original landing date"}
            >
              {d ? `+${d}d` : "On time"}
            </button>
          ))}
        </div>
      </div>
      <div className="dock__lanes">
        <VisibilityLanes analysis={analysis} start={start} end={end} time={time} onScrub={setTime} loading={status === "loading"} />
      </div>
    </div>
  );
}

export function TimelineDock() {
  const mode = useStore((s) => s.mode);
  return mode === "planner" ? <PlannerDock /> : <DiscoverDock />;
}
