import raw from "./stretches.json";
import type { Stretch } from "../types/stretch";
import { validateStretches } from "./validate";

/**
 * The configured stretches, validated at import time (src/data/validate.ts)
 * so a typo in stretches.json fails immediately instead of surfacing as a
 * runtime surprise.
 */
export const stretches: Stretch[] = validateStretches(raw);
