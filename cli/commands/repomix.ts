import { parseDuration } from "../../src/integrations/clock/mock.ts";
import { err, ok } from "../../src/shared/types.ts";
import type { Command } from "../command.ts";

export const repomix: Command = {
	kind: "world",
	usage:
		"repomix stub <text...> | repomix empty | repomix fail <reason...> | repomix missing | repomix slow <duration> | repomix last-args",
	summary:
		"control mock repomix CLI output, latency, failures, and recorded arguments",
	run: async ([sub, ...rest], world) => {
		if (sub === "last-args") {
			if (rest.length > 0) return err(`usage: ${repomix.usage}`);
			const recorded = world.repomix.lastArgs();
			return ok([`last args: ${recorded ? recorded.join(" ") : "(none)"}`]);
		}
		if (world.mode === "live") {
			if (!sub) return err(`usage: ${repomix.usage}`);
			return err(`repomix ${sub} is only available in mock mode`);
		}
		switch (sub) {
			case "stub": {
				const text = rest.join(" ").replaceAll("\\n", "\n");
				world.repomix.stub(text);
				return ok(["repomix stubbed"]);
			}
			case "empty":
				world.repomix.setEmpty();
				return ok(["repomix set to empty output"]);
			case "fail": {
				const reason = rest.join(" ");
				if (!reason) return err(`usage: ${repomix.usage}`);
				world.repomix.setFail(reason);
				return ok(["repomix set to fail"]);
			}
			case "missing":
				world.repomix.setMissing();
				return ok(["repomix set to missing"]);
			case "slow": {
				if (rest.length !== 1) return err(`usage: ${repomix.usage}`);
				const duration = parseDuration(rest[0] ?? "");
				if (!duration.ok) return err(duration.error);
				world.repomix.setSlow(duration.value.ms);
				return ok([`repomix latency -> ${duration.value.ms}ms`]);
			}
			default:
				return err(`usage: ${repomix.usage}`);
		}
	},
};
