/** Ablation of v3: identical questions and state, but the crash records are withheld ("unknown"). Measures how much
 *  of the model's verdict comes from the crash bucket versus road hierarchy / geometry / surroundings. */
import type { JunctionProps } from "../types.ts";
import * as v3 from "./v3.ts";
export const { QUESTIONS, QUESTION_HASH, stateHash, NEED_LEVELS, CONTROL_LABELS, CONTEXT } = v3;
export const buildState = (p: JunctionProps) => v3.buildState({ ...p, crashes: null });
