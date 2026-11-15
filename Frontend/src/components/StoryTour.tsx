import { useEffect, useMemo, useRef } from "react";
import { analysisKey, DAY, isoAddDays, useStore } from "../state/store";
import { delaySentence, missionMetrics } from "../lib/metrics";
import { CloseIcon } from "./icons";

const STORY_SITE = "site_001";

interface Step {
  title: string;
  body: (ctx: { delayLine: string | null; siteName: string }) => string;
  enter: () => void;
}

const go = () => useStore.getState();

const STEPS: Step[] = [
  {
    title: "The Moon's south pole",
    body: () =>
      "Future missions want to land here because of the ice hidden in craters that never see sunlight. But for the lander itself, light and a line to Earth are everything.",
    enter: () => {
      const s = go();
      s.setPlaying(false);
      s.setView("globe");
      s.selectSite(null, false);
      s.setDelay(0);
      window.dispatchEvent(new Event("globe:home"));
    },
  },
  {
    title: "The Sun skims the horizon",
    body: ({ siteName }) =>
      `At ${siteName} the Sun never climbs more than a degree or two. A ridge a few metres high can be the difference between solar power and darkness.`,
    enter: () => {
      const s = go();
      s.setView("globe");
      s.selectSite(STORY_SITE);
      s.setTime(Date.parse(s.missionStart) + 2 * DAY);
    },
  },
  {
    title: "Watch a month go by",
    body: () =>
      "Each day here lasts about a month on Earth. Watch the strip at the bottom: the Sun and Earth come and go as the Moon turns and wobbles.",
    enter: () => {
      const s = go();
      s.setTime(Date.parse(s.missionStart));
      s.setSpeed(24);
      s.setPlaying(true);
    },
  },
  {
    title: "Stand on the surface",
    body: () =>
      "This is the real horizon from NASA's laser altimeter, at true angles. Drag to look around, and tap the arrows on the ground to walk: a few hundred metres downhill can cut the sunlight in half.",
    enter: () => {
      const s = go();
      s.setPlaying(false);
      s.setSvPoint("landing");
      s.setView("surface");
    },
  },
  {
    title: "The landing slips a week",
    body: ({ delayLine }) =>
      `${delayLine ?? "Launches slip all the time."} Landing teams need to know this fast, and choose another date or another site.`,
    enter: () => {
      const s = go();
      s.selectSite(STORY_SITE, false);
      s.setView("compare");
    },
  },
  {
    title: "Now you're the mission planner",
    body: () =>
      "Turn on Mission planner (top right) for the angles, margins and constraints the engineers use, and compare up to three site-and-date options side by side.",
    enter: () => {},
  },
];

export function StoryTour() {
  const step = useStore((s) => s.storyStep);
  const setStep = useStore((s) => s.setStoryStep);
  const baseStart = useStore((s) => s.baseStart);
  const settings = useStore((s) => s.settings);
  const analyses = useStore((s) => s.analyses);
  const site = useStore((s) => s.sites.find((x) => x.id === STORY_SITE));
  const next = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (step === null) return;
    go().ensureAnalysis(STORY_SITE, baseStart);
    go().ensureAnalysis(STORY_SITE, isoAddDays(baseStart, 7));
    STEPS[step].enter();
    next.current?.focus();
  }, [step, baseStart]);

  const delayLine = useMemo(() => {
    const a = analyses[analysisKey(STORY_SITE, baseStart, settings)]?.data;
    const b = analyses[analysisKey(STORY_SITE, isoAddDays(baseStart, 7), settings)]?.data;
    if (!a || !b) return null;
    const onTime = missionMetrics(a);
    const line = delaySentence(onTime, missionMetrics(b), 7);
    return onTime.earthAtLanding ? line : `${line} Even on time, Earth is hidden at touchdown here, so the lander couldn't call home straight away.`;
  }, [analyses, baseStart, settings]);

  if (step === null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="story glass" role="dialog" aria-modal="false" aria-labelledby="story-title" aria-live="polite">
      <div className="story__top">
        <span className="eyebrow">
          Step {step + 1} of {STEPS.length}
        </span>
        <button className="btn btn--icon" onClick={() => setStep(null)} aria-label="Close the tour">
          <CloseIcon size={14} />
        </button>
      </div>
      <h3 id="story-title">{s.title}</h3>
      <p>{s.body({ delayLine, siteName: site ? site.name.split("/")[0].trim() : "this ridge" })}</p>
      <div className="story__nav">
        <div className="story__dots" aria-hidden>
          {STEPS.map((_, i) => (
            <i key={i} className={i === step ? "on" : ""} />
          ))}
        </div>
        {step > 0 && (
          <button className="btn btn--small" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button ref={next} className="btn btn--small btn--primary" onClick={() => setStep(last ? null : step + 1)}>
          {last ? "Explore on my own" : "Next"}
        </button>
      </div>
    </div>
  );
}
