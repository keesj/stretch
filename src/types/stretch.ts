export interface Stretch {
  id: string;
  title: string;
  duration: number;
  instructions: string[];
  bodyParts: string[];
  difficulty: "easy" | "medium" | "hard";
  illustration: string;
}

export interface Routine {
  id: string;
  title: string;
  description: string;
  stretches: string[];
}