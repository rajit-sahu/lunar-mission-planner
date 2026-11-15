import { DAY, DEFAULT_START, DELAYS, isoAddDays, useStore, WINDOW_DAYS } from "../../state/store";
import { useSiteSky } from "../../state/hooks";
import { fmtUTC } from "../../lib/timeline";
import { VisibilityLanes } from "../charts/VisibilityLanes";
import { PauseIcon, PlayIcon } from "../icons";
import { shortName } from "../globe/GlobeOverlay";

const SPEEDS = [
  { v: 1, label: "1 h/s" },
  { v: 6, label: "6 h/s" },
  { v: 24, label: "1 d/s" },
  { v: 72, label: "3 d/s" },
];

export function TimelineDock() {
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const missionStart = useStore((s) => s.missionStart);
  const sites = useStore((s) => s.sites);
  const selectedId = useStore((s) => s.selectedSiteId);
  const { setTime, setPlaying, setSpeed, setMissionStart } = useStore.getState();

  const siteId = selectedId ?? sites[0]?.id;
  const site = sites.find((s) => s.id === siteId);
  const { analysis, status } = useSiteSky(siteId);

  const start = Date.parse(missionStart);
  const end = start + WINDOW_DAYS * DAY;
  const elapsed = time - start;
  const delayDays = Math.round((start - Date.parse(DEFAULT_START)) / DAY);

  return (
    <div className="dock glass">
      <div className="dock__controls">
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
        <div className="dock__clock">
          <div className="dock__time mono">{fmtUTC(time)}</div>
          <div className="dock__met">
            T+{Math.floor(elapsed / DAY)}d {String(Math.floor((elapsed % DAY) / 3.6e6)).padStart(2, "0")}h after landing
          </div>
        </div>
        <div className="seg" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button key={s.v} className={speed === s.v ? "seg__btn active" : "seg__btn"} onClick={() => setSpeed(s.v)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="dock__spacer" />
        <label className="field">
          <span>Landing date</span>
          <input
            type="date"
            value={missionStart.slice(0, 10)}
            onChange={(e) => e.target.value && setMissionStart(`${e.target.value}T00:00:00Z`)}
          />
        </label>
        <div className="delay">
          <span className="delay__label">Delay</span>
          {DELAYS.map((d) => (
            <button key={d} className="chip" onClick={() => setMissionStart(isoAddDays(missionStart, d))} title={`Push the landing back ${d} days`}>
              +{d}d
            </button>
          ))}
          {delayDays !== 0 && (
            <button className="chip chip--warn" onClick={() => setMissionStart(DEFAULT_START)} title="Back to the original landing date">
              {delayDays > 0 ? `+${delayDays}d` : `${delayDays}d`} · reset
            </button>
          )}
        </div>
      </div>
      <div className="dock__lanes">
        <div className="dock__site">{site ? shortName(site) : "—"}</div>
        <VisibilityLanes analysis={analysis} start={start} end={end} time={time} onScrub={setTime} loading={status === "loading"} />
      </div>
    </div>
  );
}
