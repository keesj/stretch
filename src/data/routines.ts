import raw from "./routines.json";
import type { Routine } from "../types/routine";
import { stretches } from "./stretches";
import { validateRoutines } from "./validate";

/**
 * The configured routines, validated at import time — including that every
 * referenced stretch id exists in stretches.json.
 */
export const routines: Routine[] = validateRoutines(raw, stretches);
