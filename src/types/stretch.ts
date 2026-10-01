export interface Stretch {
  id: string;
  title: string;
  duration: number;
  instructions: string[];
  bodyParts: string[];
  difficulty: "easy" | "medium" | "hard";
  illustration: string;
  /** Animation key rendered on the exercise card (e.g. "ankle-circles") */
  animation?: string;
  /** Which side of the body the stretch targets */
  side?: "left" | "right";
}