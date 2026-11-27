import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CaseOutcome } from "../src/e2e-verification/nouns.ts";
import {
	createLiveClock,
	type LiveClock,
} from "../src/integrations/clock/live.ts";
import {
	type ClockMock,
	createClockMock,
} from "../src/integrations/clock/mock.ts";
import {
	createLiveFilesystem,
	type LiveFilesystem,
} from "../src/integrations/filesystem/live.ts";
import {
	createFilesystemMock,
	type FilesystemMock,
} from "../src/integrations/filesystem/mock.ts";
import {
	createLiveMarkitdown,
	type LiveMarkitdown,
} from "../src/integrations/markitdown/live.ts";
import {
	createMarkitdownMock,
	type MarkitdownMock,
} from "../src/integrations/markitdown/mock.ts";
import {
	createLiveNetwork,
	type LiveNetwork,
} from "../src/integrations/network/live.ts";
import {
	createNetworkMock,
	type NetworkMock,
} from "../src/integrations/network/mock.ts";
import {
	createLiveRepomix,
	type LiveRepomix,
} from "../src/integrations/repomix/live.ts";
import {
	createRepomixMock,
	type RepomixMock,
} from "../src/integrations/repomix/mock.ts";

const projectRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

/**
 * The outside world, as the harness plays it: either deterministic in-memory mocks (`mode: "mock"`)
 * or live adapters hitting real DNS, HTTP, filesystem, and `markitdown` (`mode: "live"`).
 */
export type MockWorld = {
	readonly mode: "mock";
	readonly clock: ClockMock;
	readonly network: NetworkMock;
	readonly markitdown: MarkitdownMock;
	readonly repomix: RepomixMock;
	readonly filesystem: FilesystemMock;
	readonly env: Record<string, string | undefined>;
	readonly e2eOutcomes: CaseOutcome[];
};

export type LiveWorld = {
	readonly mode: "live";
	readonly clock: LiveClock;
	readonly network: LiveNetwork;
	readonly markitdown: LiveMarkitdown;
	readonly repomix: LiveRepomix;
	readonly filesystem: LiveFilesystem;
	readonly env: Record<string, string | undefined>;
	readonly e2eOutcomes: CaseOutcome[];
};

export type World = MockWorld | LiveWorld;

export const createWorld = (): MockWorld => {
	const clock = createClockMock();
	return {
		mode: "mock",
		clock,
		network: createNetworkMock(clock),
		markitdown: createMarkitdownMock(clock),
		repomix: createRepomixMock(clock),
		filesystem: createFilesystemMock(),
		env: {},
		e2eOutcomes: [],
	};
};

export const createLiveWorld = (): LiveWorld => ({
	mode: "live",
	clock: createLiveClock(),
	network: createLiveNetwork(),
	markitdown: createLiveMarkitdown(projectRoot),
	repomix: createLiveRepomix(projectRoot),
	filesystem: createLiveFilesystem(),
	env: { ...process.env },
	e2eOutcomes: [],
});
