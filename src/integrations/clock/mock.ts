import { err, ok, type Result } from "../../shared/types.js";

/** The port every context that needs the time declares: `export type Now = () => Date`. */
export type Now = () => Date;

/**
 * The world's clock. Time only moves when a scenario moves it (`clock advance 30m`), so every run of a scenario sees
 * the same times.
 */
export type ClockMock = {
	now: Now;
	advance: (duration: Duration) => Date;
	set: (to: Date) => Date;
};

export type Duration = { readonly ms: number };

/** Where every harness session starts. */
export const startOfTime = new Date("2026-01-05T09:00:00.000Z");

export const createClockMock = (start: Date = startOfTime): ClockMock => {
	let current = new Date(start);
	return {
		now: () => new Date(current),
		advance: ({ ms }) => {
			current = new Date(current.getTime() + ms);
			return new Date(current);
		},
		set: (to) => {
			current = new Date(to);
			return new Date(current);
		},
	};
};

const unitMs: Readonly<Record<string, number>> = {
	s: 1_000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
};

/** `10s`, `30m`, `3h`, `14d` */
export const parseDuration = (input: string): Result<Duration, string> => {
	const [, amount, unit] = /^(\d+)([smhd])$/.exec(input) ?? [];
	const perUnit = unit === undefined ? undefined : unitMs[unit];
	if (amount === undefined || perUnit === undefined) {
		return err(`not a duration: "${input}" (try 10s, 30m, 3h or 14d)`);
	}
	return ok({ ms: Number(amount) * perUnit });
};
