/** What a verb or a port returns instead of throwing. */
export type Result<T, E> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/**
 * A value of `T` that is also known to be a `Kind`, so one kind can't be passed for another: `Brand<string, 'FileId'>`
 * is a string, but a plain string isn't a `FileId`.
 */
export type Brand<T, Kind extends string> = T & { readonly __brand: Kind };
