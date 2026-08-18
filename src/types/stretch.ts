export interface Stretch {
  id: string;
  title: string;
  duration: number;
  instructions: string[];
  bodyParts: string[];
  difficulty: "easy" | "medium" | "hard";
  illustration: string;
}