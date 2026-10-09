import { motion } from "framer-motion";
import type { Stretch } from "../types/stretch";

interface StretchAnimationProps {
  stretch: Stretch;
  /** Animate the figure (false = hold a still pose) */
  playing?: boolean;
}

const FIGURE = "stroke-primary-500 dark:stroke-primary-400";
const SCENE = "stroke-calm-300 dark:stroke-gray-600";

const PAUSE_TRANSITION = { duration: 0.4, ease: "easeOut" as const };

function SideBadge({ side }: { side?: "left" | "right" }) {
  if (!side) return null;
  return (
    <text
      x={14}
      y={30}
      fontSize={24}
      fontWeight={700}
      className="fill-primary-600 dark:fill-primary-400"
    >
      {side === "left" ? "L" : "R"}
    </text>
  );
}

/** Pulsing highlight on the muscle being stretched */
function Pulse({ cx, cy, r = 9, playing }: { cx: number; cy: number; r?: number; playing: boolean }) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      className="fill-primary-400 dark:fill-primary-500"
      animate={playing ? { opacity: [0.15, 0.45, 0.15] } : { opacity: 0.15 }}
      transition={playing ? { repeat: Infinity, duration: 2, ease: "easeInOut" } : PAUSE_TRANSITION}
    />
  );
}

function Limb({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={6} strokeLinecap="round" className={FIGURE} />
  );
}

function Head({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r={11} className={`fill-none ${FIGURE}`} strokeWidth={6} />;
}

/** Top-down foot with a dot orbiting the ankle in circles */
function AnkleCircles({ playing }: { playing: boolean }) {
  return (
    <>
      <circle cx={100} cy={74} r={46} fill="none" strokeWidth={2} strokeDasharray="6 8" className={SCENE} />
      <motion.g
        style={{ originX: 0.5, originY: 0.5 }}
        animate={playing ? { rotate: 360 } : { rotate: 0 }}
        transition={playing ? { repeat: Infinity, duration: 4, ease: "linear" } : PAUSE_TRANSITION}
      >
        <circle cx={100} cy={74} r={46} fill="transparent" />
        <circle cx={100} cy={28} r={7} className="fill-primary-500 dark:fill-primary-400" />
      </motion.g>
      <circle cx={100} cy={74} r={30} strokeWidth={2} className="fill-white dark:fill-gray-800 stroke-calm-300 dark:stroke-gray-600" />
      <text x={100} y={76} fontSize={26} textAnchor="middle" dominantBaseline="central">
        🦶
      </text>
    </>
  );
}

/** Seated, one leg straight with toes up and the other folded; folding forward to reach the toes.
 *  Geometry captured from a photo via the pose pipeline (src/data/poses/seated-shin.json). */
function SeatedShin({ playing }: { playing: boolean }) {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* straight leg being stretched, toes pulled up */}
      <Limb x1={52} y1={104} x2={100} y2={113} />
      <Limb x1={100} y1={113} x2={136} y2={116} />
      <Limb x1={136} y1={116} x2={148} y2={103} />
      {/* bent leg: knee up, sole against the inner thigh */}
      <Limb x1={52} y1={104} x2={64} y2={92} />
      <Limb x1={64} y1={92} x2={70} y2={108} />
      <Limb x1={70} y1={108} x2={79} y2={107} />
      <motion.g animate={playing ? { y: [0, 5, 0] } : { y: 0 }} transition={playing ? { repeat: Infinity, duration: 3, ease: "easeInOut" } : PAUSE_TRANSITION}>
        {/* torso folding forward, both arms reaching the toes */}
        <Limb x1={52} y1={104} x2={88} y2={80} />
        <Head cx={98} cy={82} />
        <Limb x1={88} y1={80} x2={94} y2={82} />
        <Limb x1={88} y1={80} x2={116} y2={94} />
        <Limb x1={116} y1={94} x2={144} y2={103} />
        <Limb x1={88} y1={80} x2={118} y2={96} />
        <Limb x1={118} y1={96} x2={146} y2={106} />
      </motion.g>
      <Pulse cx={128} cy={114} playing={playing} />
    </>
  );
}

/** Hands on the wall, back heel down with toes lifted, front knee bent.
 *  Geometry captured from a photo via the pose pipeline (src/data/poses/wall-calf.json). */
function WallCalf({ playing }: { playing: boolean }) {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      <line x1={176} y1={16} x2={176} y2={126} strokeWidth={4} className={SCENE} />
      <line x1={178} y1={42} x2={186} y2={50} strokeWidth={3} className={SCENE} />
      <line x1={178} y1={84} x2={186} y2={92} strokeWidth={3} className={SCENE} />
      {/* back leg: straight, heel on the floor, toes lifted (the stretch) */}
      <Limb x1={101} y1={72} x2={102} y2={96} />
      <Limb x1={102} y1={96} x2={100} y2={115} />
      <Limb x1={100} y1={115} x2={124} y2={117} />
      {/* front leg: bent at the knee */}
      <Limb x1={101} y1={72} x2={125} y2={94} />
      <Limb x1={125} y1={94} x2={128} y2={113} />
      <Limb x1={128} y1={113} x2={139} y2={121} />
      <motion.g animate={playing ? { x: [0, 5, 0] } : { x: 0 }} transition={playing ? { repeat: Infinity, duration: 3, ease: "easeInOut" } : PAUSE_TRANSITION}>
        <Limb x1={96} y1={31} x2={101} y2={72} />
        <Head cx={122} cy={15} />
        <Limb x1={96} y1={31} x2={113} y2={21} />
        <Limb x1={96} y1={31} x2={140} y2={48} />
        <Limb x1={140} y1={48} x2={174} y2={58} />
      </motion.g>
      <Pulse cx={101} cy={108} playing={playing} />
    </>
  );
}

/** Hands on the wall, both knees bent, hips sunk low, back heel on the floor.
 *  Geometry captured from a photo via the pose pipeline (src/data/poses/soleus.json). */
function Soleus({ playing }: { playing: boolean }) {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      <line x1={182} y1={18} x2={182} y2={126} strokeWidth={4} className={SCENE} />
      <line x1={184} y1={44} x2={192} y2={52} strokeWidth={3} className={SCENE} />
      <line x1={184} y1={84} x2={192} y2={92} strokeWidth={3} className={SCENE} />
      <motion.g animate={playing ? { y: [0, 4, 0] } : { y: 0 }} transition={playing ? { repeat: Infinity, duration: 3, ease: "easeInOut" } : PAUSE_TRANSITION}>
        {/* back leg bent, heel pressed into the floor */}
        <Limb x1={91} y1={66} x2={78} y2={91} />
        <Limb x1={78} y1={91} x2={71} y2={118} />
        <Limb x1={71} y1={118} x2={70} y2={126} />
        {/* front leg bent, knee over the ankle */}
        <Limb x1={91} y1={66} x2={101} y2={85} />
        <Limb x1={101} y1={85} x2={103} y2={119} />
        <Limb x1={103} y1={119} x2={110} y2={118} />
        <Limb x1={91} y1={29} x2={91} y2={66} />
        <Head cx={90} cy={15} />
        <Limb x1={91} y1={29} x2={91} y2={26} />
        <Limb x1={91} y1={29} x2={135} y2={45} />
        <Limb x1={135} y1={45} x2={180} y2={58} />
      </motion.g>
      <Pulse cx={74} cy={105} playing={playing} />
    </>
  );
}

/** Standing, reaching the arms overhead.
 *  Geometry captured from a photo via the pose pipeline (src/data/poses/upward-salute.json). */
function UpwardSalute({ playing }: { playing: boolean }) {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      <Limb x1={88} y1={74} x2={89} y2={97} />
      <Limb x1={89} y1={97} x2={89} y2={126} />
      <Limb x1={88} y1={74} x2={97} y2={96} />
      <Limb x1={97} y1={96} x2={95} y2={125} />
      <Limb x1={85} y1={46} x2={88} y2={74} />
      <Head cx={94} cy={33} />
      <Limb x1={85} y1={46} x2={88} y2={42} />
      <motion.g animate={playing ? { y: [0, -10, 0] } : { y: 0 }} transition={playing ? { repeat: Infinity, duration: 3, ease: "easeInOut" } : PAUSE_TRANSITION}>
        <Limb x1={85} y1={46} x2={112} y2={32} />
        <Limb x1={112} y1={32} x2={115} y2={18} />
        <Limb x1={85} y1={46} x2={78} y2={32} />
        <Limb x1={78} y1={32} x2={76} y2={17} />
      </motion.g>
    </>
  );
}

/** Standing, hinging at the hips with the torso folding down toward the feet.
 *  Geometry captured from a photo via the pose pipeline (src/data/poses/toe-touch.json). */
function ToeTouch({ playing }: { playing: boolean }) {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* straight legs, feet on the floor */}
      <Limb x1={76} y1={18} x2={68} y2={68} />
      <Limb x1={68} y1={68} x2={72} y2={114} />
      <Limb x1={69} y1={121} x2={100} y2={126} />
      <Limb x1={76} y1={18} x2={73} y2={66} />
      <Limb x1={73} y1={66} x2={77} y2={112} />
      <Limb x1={74} y1={119} x2={105} y2={124} />
      <motion.g animate={playing ? { y: [0, 6, 0] } : { y: 0 }} transition={playing ? { repeat: Infinity, duration: 3, ease: "easeInOut" } : PAUSE_TRANSITION}>
        {/* torso folded down toward the feet, head hanging */}
        <Limb x1={103} y1={59} x2={76} y2={18} />
        <Head cx={128} cy={72} />
        <Limb x1={103} y1={59} x2={118} y2={67} />
        <Limb x1={103} y1={59} x2={67} y2={82} />
        <Limb x1={67} y1={82} x2={67} y2={108} />
      </motion.g>
      <Pulse cx={86} cy={34} playing={playing} />
    </>
  );
}

/** Lunging, back knee low, arms reaching overhead.
 *  Geometry captured from a photo via the pose pipeline (src/data/poses/lunge.json). */
function Lunge({ playing }: { playing: boolean }) {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* back leg: thigh low and back, shin folding to the floor */}
      <Limb x1={64} y1={97} x2={36} y2={92} />
      <Limb x1={36} y1={92} x2={53} y2={116} />
      <Limb x1={53} y1={116} x2={44} y2={126} />
      {/* front leg: thigh down to the knee, shin forward */}
      <Limb x1={64} y1={97} x2={97} y2={126} />
      <Limb x1={97} y1={126} x2={127} y2={124} />
      <Limb x1={129} y1={119} x2={136} y2={125} />
      <Limb x1={84} y1={54} x2={64} y2={97} />
      <Head cx={87} cy={33} />
      <Limb x1={84} y1={54} x2={85} y2={44} />
      <motion.g animate={playing ? { y: [0, 3, 0] } : { y: 0 }} transition={playing ? { repeat: Infinity, duration: 3, ease: "easeInOut" } : PAUSE_TRANSITION}>
        <Limb x1={84} y1={54} x2={99} y2={33} />
        <Limb x1={99} y1={33} x2={115} y2={18} />
      </motion.g>
      <Pulse cx={50} cy={94} playing={playing} />
    </>
  );
}

/** Prone, arms pushing the chest off the floor.
 *  Geometry captured from a photo via the pose pipeline (src/data/poses/upward-dog.json). */
function UpwardDog({ playing }: { playing: boolean }) {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* legs stay on the floor */}
      <Limb x1={122} y1={106} x2={85} y2={111} />
      <Limb x1={85} y1={111} x2={51} y2={107} />
      <Limb x1={47} y1={107} x2={47} y2={116} />
      <motion.g animate={playing ? { y: [0, -3, 0] } : { y: 0 }} transition={playing ? { repeat: Infinity, duration: 3, ease: "easeInOut" } : PAUSE_TRANSITION}>
        <Limb x1={142} y1={52} x2={122} y2={106} />
        <Limb x1={142} y1={52} x2={134} y2={95} />
        <Limb x1={134} y1={95} x2={126} y2={126} />
        <Head cx={149} cy={16} />
        <Limb x1={142} y1={52} x2={147} y2={27} />
      </motion.g>
      <Pulse cx={137} cy={64} playing={playing} />
    </>
  );
}

/** Kneeling, hips back by the heels, folded forward over the arms.
 *  Geometry captured from a photo via the pose pipeline (src/data/poses/childs-pose.json). */
function ChildsPose({ playing }: { playing: boolean }) {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* legs folded under, sitting back on the heels */}
      <Limb x1={30} y1={91} x2={88} y2={118} />
      <Limb x1={88} y1={118} x2={33} y2={116} />
      <Limb x1={28} y1={109} x2={14} y2={117} />
      <motion.g animate={playing ? { y: [0, -3, 0] } : { y: 0 }} transition={playing ? { repeat: Infinity, duration: 3, ease: "easeInOut" } : PAUSE_TRANSITION}>
        <Limb x1={112} y1={99} x2={30} y2={91} />
        <Head cx={120} cy={111} />
        <Limb x1={112} y1={99} x2={114} y2={102} />
        <Limb x1={112} y1={99} x2={147} y2={122} />
        <Limb x1={147} y1={122} x2={186} y2={126} />
        <Limb x1={112} y1={99} x2={188} y2={117} />
      </motion.g>
      <Pulse cx={80} cy={94} playing={playing} />
    </>
  );
}

/** Inverted V: hands and toes down, hips pressed up.
 *  Geometry captured from a photo via the pose pipeline (src/data/poses/downward-dog.json). */
function DownwardDog({ playing }: { playing: boolean }) {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      <motion.g animate={playing ? { y: [0, -4, 0] } : { y: 0 }} transition={playing ? { repeat: Infinity, duration: 3, ease: "easeInOut" } : PAUSE_TRANSITION}>
        <Limb x1={105} y1={18} x2={134} y2={61} />
        <Limb x1={134} y1={61} x2={156} y2={104} />
        <Limb x1={162} y1={110} x2={145} y2={124} />
        <Limb x1={68} y1={65} x2={105} y2={18} />
        <Limb x1={68} y1={65} x2={55} y2={99} />
        <Limb x1={55} y1={99} x2={38} y2={126} />
        <Head cx={70} cy={84} />
        <Limb x1={68} y1={65} x2={69} y2={73} />
      </motion.g>
      <Pulse cx={119} cy={40} playing={playing} />
    </>
  );
}

/** Front view: wide stance, torso folded down between the legs, head hanging heavy.
 *  A single photo capture can't resolve the wide stance (MediaPipe finds only one leg in
 *  this fold), so the splayed legs are drawn to match the pose. */
function WideLegBend({ playing }: { playing: boolean }) {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* wide stance: both legs straight, splayed apart */}
      <Limb x1={100} y1={38} x2={54} y2={76} />
      <Limb x1={54} y1={76} x2={30} y2={116} />
      <Limb x1={30} y1={116} x2={17} y2={126} />
      <Limb x1={100} y1={38} x2={146} y2={76} />
      <Limb x1={146} y1={76} x2={170} y2={116} />
      <Limb x1={170} y1={116} x2={183} y2={126} />
      <motion.g animate={playing ? { y: [0, 5, 0] } : { y: 0 }} transition={playing ? { repeat: Infinity, duration: 3, ease: "easeInOut" } : PAUSE_TRANSITION}>
        {/* torso folded straight down, head hanging between the legs */}
        <Limb x1={100} y1={38} x2={100} y2={80} />
        <Head cx={100} cy={97} />
        <Limb x1={100} y1={80} x2={100} y2={86} />
        <Limb x1={100} y1={80} x2={78} y2={92} />
        <Limb x1={78} y1={92} x2={48} y2={119} />
        <Limb x1={100} y1={80} x2={122} y2={92} />
        <Limb x1={122} y1={92} x2={152} y2={119} />
      </motion.g>
      <Pulse cx={74} cy={60} playing={playing} />
    </>
  );
}

export function StretchAnimation({ stretch, playing = true }: StretchAnimationProps) {
  let figure = null;
  switch (stretch.animation) {
    case "ankle-circles":
      figure = <AnkleCircles playing={playing} />;
      break;
    case "seated-shin":
      figure = <SeatedShin playing={playing} />;
      break;
    case "wall-calf":
      figure = <WallCalf playing={playing} />;
      break;
    case "soleus":
      figure = <Soleus playing={playing} />;
      break;
    case "upward-salute":
      figure = <UpwardSalute playing={playing} />;
      break;
    case "toe-touch":
      figure = <ToeTouch playing={playing} />;
      break;
    case "lunge":
      figure = <Lunge playing={playing} />;
      break;
    case "upward-dog":
      figure = <UpwardDog playing={playing} />;
      break;
    case "childs-pose":
      figure = <ChildsPose playing={playing} />;
      break;
    case "downward-dog":
      figure = <DownwardDog playing={playing} />;
      break;
    case "wide-leg-bend":
      figure = <WideLegBend playing={playing} />;
      break;
  }
  if (!figure) return null;

  const mirrored = stretch.side === "right";
  return (
    <svg viewBox="0 0 200 140" className="w-full h-auto" role="img" aria-label={stretch.title}>
      <g transform={mirrored ? "scale(-1,1) translate(-200,0)" : undefined}>
        {figure}
      </g>
      <SideBadge side={stretch.side} />
    </svg>
  );
}
