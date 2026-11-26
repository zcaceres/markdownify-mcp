import { parseDuration } from "../../src/integrations/clock/mock.ts";
import { err, ok } from "../../src/shared/types.ts";
import type { Command } from "../command.ts";

export const network: Command = {
	kind: "world",
	usage:
		"network stub <url> <status> <body...> | network stub-size <url> <bytes> | network content-type <url> <mime...> | network redirect <from> <status> <to> | network fail <url> <reason...> | network slow <url> <duration> | network dns <host> <ip...> | network dns-fail <host> | network fetch-count",
	summary:
		"control mock network responses, headers, sizes, latency, DNS, redirects, and failures",
	run: async ([sub, arg1, ...rest], world) => {
		if (sub === "fetch-count") {
			if (arg1 !== undefined) return err(`usage: ${network.usage}`);
			return ok([`fetch count: ${world.network.fetchCount()}`]);
		}
		if (world.mode === "live") {
			if (!sub) return err(`usage: ${network.usage}`);
			return err(`network ${sub} is only available in mock mode`);
		}
		switch (sub) {
			case "stub": {
				const [rawStatus, ...bodyParts] = rest;
				const status = Number(rawStatus);
				if (
					!arg1 ||
					!Number.isInteger(status) ||
					status < 100 ||
					status > 599
				) {
					return err(`usage: ${network.usage}`);
				}
				world.network.stub(arg1, status, bodyParts.join(" "));
				return ok([`stubbed ${arg1} -> ${status}`]);
			}
			case "stub-size": {
				const [rawBytes] = rest;
				const bytes = Number(rawBytes);
				if (
					!arg1 ||
					rest.length !== 1 ||
					!Number.isInteger(bytes) ||
					bytes < 0
				) {
					return err(`usage: ${network.usage}`);
				}
				world.network.stubSize(arg1, bytes);
				return ok([`stubbed ${arg1} -> 200 (${bytes} bytes)`]);
			}
			case "content-type": {
				const mime = rest.join(" ");
				if (!arg1 || !mime) return err(`usage: ${network.usage}`);
				if (!world.network.setContentType(arg1, mime)) {
					return err(`no stubbed response for ${arg1}`);
				}
				return ok([`content-type ${arg1} -> ${mime}`]);
			}
			case "redirect": {
				const [rawStatus, to] = rest;
				const status = Number(rawStatus);
				if (
					!arg1 ||
					!to ||
					rest.length !== 2 ||
					!Number.isInteger(status) ||
					status < 300 ||
					status > 399
				) {
					return err(`usage: ${network.usage}`);
				}
				world.network.redirect(arg1, status, to);
				return ok([`redirected ${arg1} -> ${status} ${to}`]);
			}
			case "fail": {
				const reason = rest.join(" ");
				if (!arg1 || !reason) return err(`usage: ${network.usage}`);
				world.network.fail(arg1, reason);
				return ok([`network set to fail for ${arg1}`]);
			}
			case "slow": {
				const [rawDuration] = rest;
				if (!arg1 || rest.length !== 1) return err(`usage: ${network.usage}`);
				const duration = parseDuration(rawDuration ?? "");
				if (!duration.ok) return err(duration.error);
				world.network.slow(arg1, duration.value.ms);
				return ok([`network latency for ${arg1} -> ${duration.value.ms}ms`]);
			}
			case "dns": {
				if (!arg1 || rest.length === 0) return err(`usage: ${network.usage}`);
				world.network.setDns(arg1, rest);
				return ok([`dns ${arg1} -> ${rest.join(", ")}`]);
			}
			case "dns-fail": {
				if (!arg1 || rest.length > 0) return err(`usage: ${network.usage}`);
				world.network.failDns(arg1);
				return ok([`dns set to fail for ${arg1}`]);
			}
			default:
				return err(`usage: ${network.usage}`);
		}
	},
};
