import { parseDuration } from "../../src/integrations/clock/mock.ts";
import { err, ok } from "../../src/shared/types.ts";
import type { Command } from "../command.ts";

export const markitdown: Command = {
	kind: "world",
	usage:
		"markitdown stub <text...> | markitdown empty | markitdown fail <reason...> | markitdown missing | markitdown slow <duration> | markitdown last-input",
	summary:
		"control mock markitdown CLI output, latency, failures, and recorded input",
	run: async ([sub, ...rest], world) => {
		if (sub === "last-input") {
			if (rest.length > 0) return err(`usage: ${markitdown.usage}`);
			return ok([`last input: ${world.markitdown.lastInput() ?? "(none)"}`]);
		}
		if (world.mode === "live") {
			if (!sub) return err(`usage: ${markitdown.usage}`);
			return err(`markitdown ${sub} is only available in mock mode`);
		}
		switch (sub) {
			case "stub": {
				const text = rest.join(" ").replaceAll("\\n", "\n");
				world.markitdown.stub(text);
				return ok(["markitdown stubbed"]);
			}
			case "empty":
				world.markitdown.setEmpty();
				return ok(["markitdown set to empty output"]);
			case "fail": {
				const reason = rest.join(" ");
				if (!reason) return err(`usage: ${markitdown.usage}`);
				world.markitdown.setFail(reason);
				return ok(["markitdown set to fail"]);
			}
			case "missing":
				world.markitdown.setMissing();
				return ok(["markitdown set to missing"]);
			case "slow": {
				if (rest.length !== 1) return err(`usage: ${markitdown.usage}`);
				const duration = parseDuration(rest[0] ?? "");
				if (!duration.ok) return err(duration.error);
				world.markitdown.setSlow(duration.value.ms);
				return ok([`markitdown latency -> ${duration.value.ms}ms`]);
			}
			default:
				return err(`usage: ${markitdown.usage}`);
		}
	},
};
