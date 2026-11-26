import { isIP } from "node:net";
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
import type { ClockMock } from "../clock/mock.js";

type StubbedOutcome =
	| {
			readonly kind: "response";
			readonly status: number;
			readonly body: Uint8Array;
			readonly reportedSize?: number;
			readonly location?: string;
			readonly contentType?: string;
	  }
	| { readonly kind: "failure"; readonly reason: string };

type DnsOutcome =
	| {
			readonly kind: "addresses";
			readonly addresses: readonly ResolvedAddress[];
	  }
	| { readonly kind: "failure" };

const DEFAULT_PUBLIC_ADDRESS: ResolvedAddress = {
	address: "93.184.216.34",
	family: 4,
};

export type NetworkMock = {
	readonly resolveHost: ResolveHost;
	readonly fetchWebUrl: FetchWebUrl;
	readonly stub: (url: string, status: number, body: string) => void;
	readonly stubSize: (url: string, bytes: number) => void;
	readonly setContentType: (url: string, contentType: string) => boolean;
	readonly redirect: (fromUrl: string, status: number, toUrl: string) => void;
	readonly fail: (url: string, reason: string) => void;
	readonly slow: (url: string, durationMs: number) => void;
	readonly setDns: (hostname: string, addresses: readonly string[]) => void;
	readonly failDns: (hostname: string) => void;
	readonly fetchCount: () => number;
};

export const createNetworkMock = (clock?: ClockMock): NetworkMock => {
	const outcomes = new Map<string, StubbedOutcome>();
	const latencies = new Map<string, number>();
	const dnsRecords = new Map<string, DnsOutcome>();
	let fetches = 0;

	return {
		stub: (url, status, body) => {
			outcomes.set(url, {
				kind: "response",
				status,
				body: new TextEncoder().encode(body),
			});
		},
		stubSize: (url, bytes) => {
			outcomes.set(url, {
				kind: "response",
				status: 200,
				body: new Uint8Array(),
				reportedSize: bytes,
			});
		},
		setContentType: (url, contentType) => {
			const existing = outcomes.get(url);
			if (existing?.kind !== "response") {
				return false;
			}
			outcomes.set(url, { ...existing, contentType });
			return true;
		},
		redirect: (fromUrl, status, toUrl) => {
			outcomes.set(fromUrl, {
				kind: "response",
				status,
				body: new Uint8Array(),
				location: toUrl,
			});
		},
		fail: (url, reason) => {
			outcomes.set(url, { kind: "failure", reason });
		},
		slow: (url, durationMs) => {
			latencies.set(url, durationMs);
		},
		setDns: (hostname, addresses) => {
			dnsRecords.set(hostname.toLowerCase(), {
				kind: "addresses",
				addresses: addresses.map((address) => ({
					address,
					family: isIP(address) === 6 ? 6 : 4,
				})),
			});
		},
		failDns: (hostname) => {
			dnsRecords.set(hostname.toLowerCase(), { kind: "failure" });
		},
		fetchCount: () => fetches,
		resolveHost: async (
			hostname: string,
		): Promise<Result<readonly ResolvedAddress[], string>> => {
			const record = dnsRecords.get(hostname.toLowerCase());
			if (!record) {
				return ok([DEFAULT_PUBLIC_ADDRESS]);
			}
			if (record.kind === "failure") {
				return err("ENOTFOUND");
			}
			return ok(record.addresses);
		},
		fetchWebUrl: async (
			url: WebUrl,
			limits: { readonly timeoutMs: number; readonly maxBytes: number },
		): Promise<Result<FetchedResponse, FetchError>> => {
			fetches++;
			const delayMs = latencies.get(url) ?? 0;
			if (delayMs > limits.timeoutMs) {
				clock?.advance({ ms: limits.timeoutMs });
				return err({ kind: "timeout", timeoutMs: limits.timeoutMs });
			}
			if (delayMs > 0) {
				clock?.advance({ ms: delayMs });
			}

			const outcome = outcomes.get(url);
			if (!outcome) {
				return err({
					kind: "network",
					reason: `no stub configured for ${url}`,
				});
			}
			if (outcome.kind === "failure") {
				return err({ kind: "network", reason: outcome.reason });
			}
			const effectiveSize = outcome.reportedSize ?? outcome.body.byteLength;
			if (
				outcome.status >= 200 &&
				outcome.status < 300 &&
				!shouldPassUrlDirectly(url) &&
				effectiveSize > limits.maxBytes
			) {
				return err({ kind: "too-large", maxBytes: limits.maxBytes });
			}
			return ok({
				status: outcome.status,
				body: outcome.body,
				finalUrl: url,
				...(outcome.location !== undefined
					? { location: outcome.location }
					: {}),
				...(outcome.contentType !== undefined
					? { contentType: outcome.contentType }
					: {}),
			});
		},
	};
};
