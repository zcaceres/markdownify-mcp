import type { Now } from "./mock.js";

export type LiveClock = {
	readonly now: Now;
};

export const createLiveClock = (): LiveClock => ({
	now: () => new Date(),
});
