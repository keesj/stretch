import { motion } from "framer-motion";
import type { Stretch } from "../types/stretch";

interface StretchAnimationProps {
  stretch: Stretch;
}

const FIGURE = "stroke-primary-500 dark:stroke-primary-400";
const SCENE = "stroke-calm-300 dark:stroke-gray-600";

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
function Pulse({ cx, cy, r = 9 }: { cx: number; cy: number; r?: number }) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      className="fill-primary-400 dark:fill-primary-500"
      animate={{ opacity: [0.15, 0.45, 0.15] }}
      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
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
function AnkleCircles() {
  return (
    <>
      <circle cx={100} cy={74} r={46} fill="none" strokeWidth={2} strokeDasharray="6 8" className={SCENE} />
      <motion.g
        style={{ originX: 0.5, originY: 0.5 }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
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

/** Seated on the floor, one leg straight with toes pulled up, other knee up, hands holding the toes */
function SeatedShin() {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* extended leg being stretched (straight), toes pulled up toward the shin */}
      <Limb x1={62} y1={114} x2={126} y2={118} />
      <Limb x1={126} y1={118} x2={139} y2={110} />
      {/* bent leg: knee up, foot on the floor */}
      <Limb x1={62} y1={114} x2={90} y2={84} />
      <Limb x1={90} y1={84} x2={74} y2={118} />
      <Limb x1={74} y1={118} x2={86} y2={122} />
      <motion.g animate={{ x: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}>
        <Limb x1={62} y1={114} x2={74} y2={62} />
        <Head cx={84} cy={48} />
        <Limb x1={72} y1={64} x2={134} y2={112} />
        <Limb x1={68} y1={70} x2={128} y2={118} />
      </motion.g>
      <Pulse cx={94} cy={116} />
    </>
  );
}

/** Hands on the wall, back leg straight with heel down, front knee bent */
function WallCalf() {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      <line x1={176} y1={16} x2={176} y2={126} strokeWidth={4} className={SCENE} />
      <line x1={178} y1={42} x2={186} y2={50} strokeWidth={3} className={SCENE} />
      <line x1={178} y1={84} x2={186} y2={92} strokeWidth={3} className={SCENE} />
      {/* back leg straight, heel on the floor, foot pointing toward the wall */}
      <Limb x1={92} y1={92} x2={54} y2={122} />
      <Limb x1={54} y1={122} x2={66} y2={124} />
      {/* front leg bent at the knee */}
      <Limb x1={92} y1={92} x2={116} y2={108} />
      <Limb x1={116} y1={108} x2={120} y2={124} />
      <Limb x1={120} y1={124} x2={132} y2={124} />
      <motion.g animate={{ x: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
        <Limb x1={92} y1={92} x2={128} y2={48} />
        <Head cx={138} cy={40} />
        <Limb x1={128} y1={48} x2={174} y2={58} />
        <Limb x1={124} y1={54} x2={174} y2={68} />
      </motion.g>
      <Pulse cx={74} cy={106} />
    </>
  );
}

/** Hands on the wall, both knees bent pointing down, hips sunk low, back heel on the floor */
function Soleus() {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      <line x1={182} y1={18} x2={182} y2={126} strokeWidth={4} className={SCENE} />
      <line x1={184} y1={44} x2={192} y2={52} strokeWidth={3} className={SCENE} />
      <line x1={184} y1={84} x2={192} y2={92} strokeWidth={3} className={SCENE} />
      <motion.g animate={{ y: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
        {/* back leg bent: thigh down-back to the knee, shin down to the heel on the floor */}
        <Limb x1={96} y1={100} x2={66} y2={110} />
        <Limb x1={66} y1={110} x2={56} y2={124} />
        <Limb x1={56} y1={124} x2={68} y2={124} />
        {/* front leg bent: knee over the ankle */}
        <Limb x1={96} y1={100} x2={124} y2={110} />
        <Limb x1={124} y1={110} x2={130} y2={124} />
        <Limb x1={130} y1={124} x2={142} y2={124} />
        <Limb x1={96} y1={100} x2={110} y2={46} />
        <Head cx={118} cy={38} />
        <Limb x1={110} y1={48} x2={174} y2={58} />
        <Limb x1={106} y1={54} x2={174} y2={68} />
      </motion.g>
      <Pulse cx={61} cy={117} />
    </>
  );
}

/** Standing, reaching the arms overhead */
function UpwardSalute() {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      <Limb x1={100} y1={92} x2={88} y2={124} />
      <Limb x1={100} y1={92} x2={112} y2={124} />
      <Limb x1={100} y1={49} x2={100} y2={92} />
      <Head cx={100} cy={38} />
      <motion.g animate={{ y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
        <Limb x1={100} y1={55} x2={78} y2={22} />
        <Limb x1={100} y1={55} x2={122} y2={22} />
      </motion.g>
    </>
  );
}

/** Standing, hinging at the hips with the torso folding down toward the feet */
function ToeTouch() {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* straight legs, feet on the floor */}
      <Limb x1={96} y1={88} x2={90} y2={122} />
      <Limb x1={90} y1={122} x2={101} y2={124} />
      <Limb x1={96} y1={88} x2={104} y2={122} />
      <Limb x1={104} y1={122} x2={115} y2={124} />
      <motion.g animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
        {/* torso folded down toward the feet, head hanging */}
        <Limb x1={96} y1={88} x2={122} y2={104} />
        <Head cx={132} cy={112} />
        <Limb x1={122} y1={104} x2={126} y2={124} />
        <Limb x1={118} y1={106} x2={122} y2={124} />
      </motion.g>
      <Pulse cx={98} cy={106} />
    </>
  );
}

/** Lunging, back knee on the floor, holding the back foot */
function Lunge() {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* back leg: knee on the floor, shin along the floor, foot held */}
      <Limb x1={88} y1={78} x2={58} y2={124} />
      <Limb x1={58} y1={124} x2={84} y2={124} />
      <Limb x1={84} y1={124} x2={92} y2={118} />
      {/* front leg: thigh down to a knee stacked over the ankle, shin vertical */}
      <Limb x1={88} y1={78} x2={116} y2={92} />
      <Limb x1={116} y1={92} x2={120} y2={124} />
      <Limb x1={120} y1={124} x2={132} y2={124} />
      <Limb x1={88} y1={78} x2={84} y2={42} />
      <Head cx={83} cy={29} />
      <motion.g animate={{ y: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
        <Limb x1={84} y1={44} x2={80} y2={112} />
        <Limb x1={80} y1={48} x2={86} y2={116} />
      </motion.g>
      <Pulse cx={80} cy={90} />
    </>
  );
}

/** Prone, arms pushing the chest off the floor */
function UpwardDog() {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* legs stay on the floor */}
      <Limb x1={75} y1={112} x2={40} y2={110} />
      <Limb x1={40} y1={110} x2={30} y2={118} />
      <motion.g animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
        <Limb x1={75} y1={112} x2={118} y2={72} />
        <Limb x1={118} y1={72} x2={146} y2={60} />
        <Head cx={152} cy={56} />
        <Limb x1={114} y1={76} x2={136} y2={122} />
        <Limb x1={108} y1={80} x2={128} y2={124} />
      </motion.g>
      <Pulse cx={112} cy={84} />
    </>
  );
}

/** Kneeling, hips down by the heels, folded forward over the arms */
function ChildsPose() {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      {/* hips settled next to the heels */}
      <Limb x1={108} y1={112} x2={100} y2={122} />
      <Limb x1={100} y1={122} x2={125} y2={124} />
      <Limb x1={125} y1={124} x2={132} y2={106} />
      <motion.g animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
        <Limb x1={108} y1={112} x2={64} y2={116} />
        <Head cx={54} cy={118} />
        <Limb x1={64} y1={116} x2={30} y2={122} />
        <Limb x1={62} y1={119} x2={32} y2={125} />
      </motion.g>
      <Pulse cx={90} cy={112} />
    </>
  );
}

/** Inverted V: hands and toes down, hips pressed up */
function DownwardDog() {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      <motion.g animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
        <Limb x1={148} y1={124} x2={138} y2={84} />
        <Limb x1={138} y1={84} x2={88} y2={46} />
        <Limb x1={88} y1={46} x2={45} y2={118} />
        <Limb x1={45} y1={118} x2={36} y2={124} />
        <Head cx={130} cy={76} />
      </motion.g>
      <Pulse cx={66} cy={84} />
    </>
  );
}

/** Wide stance, folding forward between the legs */
function WideLegBend() {
  return (
    <>
      <line x1={14} y1={126} x2={186} y2={126} strokeWidth={3} className={SCENE} />
      <Limb x1={52} y1={124} x2={88} y2={90} />
      <Limb x1={148} y1={124} x2={112} y2={90} />
      <motion.g animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
        {/* torso folded down between the legs, arms reaching between them */}
        <Limb x1={100} y1={90} x2={100} y2={60} />
        <Head cx={100} cy={48} />
        <Limb x1={100} y1={62} x2={92} y2={88} />
        <Limb x1={100} y1={62} x2={108} y2={88} />
      </motion.g>
      <Pulse cx={100} cy={74} />
    </>
  );
}

export function StretchAnimation({ stretch }: StretchAnimationProps) {
  let figure = null;
  switch (stretch.animation) {
    case "ankle-circles":
      figure = <AnkleCircles />;
      break;
    case "seated-shin":
      figure = <SeatedShin />;
      break;
    case "wall-calf":
      figure = <WallCalf />;
      break;
    case "soleus":
      figure = <Soleus />;
      break;
    case "upward-salute":
      figure = <UpwardSalute />;
      break;
    case "toe-touch":
      figure = <ToeTouch />;
      break;
    case "lunge":
      figure = <Lunge />;
      break;
    case "upward-dog":
      figure = <UpwardDog />;
      break;
    case "childs-pose":
      figure = <ChildsPose />;
      break;
    case "downward-dog":
      figure = <DownwardDog />;
      break;
    case "wide-leg-bend":
      figure = <WideLegBend />;
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
