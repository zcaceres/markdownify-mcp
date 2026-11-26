import { lookup } from "node:dns/promises";
import { err, ok, type Result } from "../../shared/types.js";
import type {
	FetchedResponse,
	ResolvedAddress,
	WebUrl,
} from "../../web-conversion/nouns.js";
import type {
	FetchError,
	FetchWebUrl,
	ResolveHost,
} from "../../web-conversion/ports.js";
import { shouldPassUrlDirectly } from "../../web-conversion/verbs.js";

export type LiveNetwork = {
	readonly resolveHost: ResolveHost;
	readonly fetchWebUrl: FetchWebUrl;
	readonly fetchCount: () => number;
};

const readBodyWithLimit = async (
	response: Response,
	maxBytes: number,
): Promise<Result<Uint8Array, FetchError>> => {
	const rawLength = response.headers.get("content-length");
	if (rawLength && /^\d+$/.test(rawLength.trim())) {
		const declared = Number.parseInt(rawLength.trim(), 10);
		if (declared > maxBytes) {
			await response.body?.cancel().catch(() => {});
			return err({ kind: "too-large", maxBytes });
		}
	}

	if (response.body && typeof response.body.getReader === "function") {
		const reader = response.body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (!value) continue;
				total += value.byteLength;
				if (total > maxBytes) {
					await reader.cancel().catch(() => {});
					return err({ kind: "too-large", maxBytes });
				}
				chunks.push(value);
			}
		} catch (error: unknown) {
			const reason =
				error instanceof Error ? error.message : "Stream read failed";
			return err({ kind: "network", reason });
		} finally {
			reader.releaseLock();
		}
		return ok(Buffer.concat(chunks));
	}

	try {
		const arrayBuffer = await response.arrayBuffer();
		if (arrayBuffer.byteLength > maxBytes) {
			return err({ kind: "too-large", maxBytes });
		}
		return ok(new Uint8Array(arrayBuffer));
	} catch (error: unknown) {
		const reason =
			error instanceof Error ? error.message : "Failed reading response body";
		return err({ kind: "network", reason });
	}
};

export const createLiveNetwork = (): LiveNetwork => {
	let fetches = 0;

	return {
		fetchCount: () => fetches,
		resolveHost: async (
			hostname: string,
		): Promise<Result<readonly ResolvedAddress[], string>> => {
			try {
				const addresses = await lookup(hostname, { all: true, verbatim: true });
				return ok(addresses);
			} catch (error: unknown) {
				const reason =
					error instanceof Error ? error.message : "DNS lookup failed";
				return err(reason);
			}
		},
		fetchWebUrl: async (
			url: WebUrl,
			limits: { readonly timeoutMs: number; readonly maxBytes: number },
		): Promise<Result<FetchedResponse, FetchError>> => {
			fetches++;
			const signal = AbortSignal.timeout(limits.timeoutMs);
			let response: Response;
			try {
				response = await fetch(url, { redirect: "manual", signal });
			} catch (error: unknown) {
				if (
					signal.aborted ||
					(error instanceof Error &&
						(error.name === "TimeoutError" || error.name === "AbortError"))
				) {
					return err({ kind: "timeout", timeoutMs: limits.timeoutMs });
				}
				const reason =
					error instanceof Error ? error.message : "Unknown network error";
				return err({ kind: "network", reason });
			}

			const location = response.headers.get("location") ?? undefined;
			const contentType = response.headers.get("content-type") ?? undefined;

			if (
				(response.status >= 300 && response.status < 400 && location) ||
				response.status < 200 ||
				response.status >= 300 ||
				shouldPassUrlDirectly(url)
			) {
				await response.body?.cancel().catch(() => {});
				return ok({
					status: response.status,
					body: new Uint8Array(),
					finalUrl: url,
					...(location !== undefined ? { location } : {}),
					...(contentType !== undefined ? { contentType } : {}),
				});
			}

			const bodyResult = await readBodyWithLimit(response, limits.maxBytes);
			if (!bodyResult.ok) {
				return bodyResult;
			}

			return ok({
				status: response.status,
				body: bodyResult.value,
				finalUrl: url,
				...(contentType !== undefined ? { contentType } : {}),
			});
		},
	};
};
