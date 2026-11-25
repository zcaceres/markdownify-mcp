import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Markdownify } from "./Markdownify";

const sampleDataDir = path.join(__dirname, "sample-data");
const tempDir = os.tmpdir();
// Cold Python imports after a fresh install can exceed Bun's five-second default.
const conversionTimeout = 30_000;

beforeAll(() => {
	// Ensure the sample data directory exists
	if (!fs.existsSync(sampleDataDir)) {
		throw new Error("Sample data directory not found");
	}
});

afterAll(() => {
	// Clean up any temporary files created during tests
	const tempFiles = fs.readdirSync(tempDir);
	tempFiles.forEach((file) => {
		if (file.startsWith("markdown_output_")) {
			fs.unlinkSync(path.join(tempDir, file));
		}
	});
});

test(
	"Markdownify.toMarkdown converts PDF file to Markdown",
	async () => {
		const pdfPath = path.join(sampleDataDir, "test.pdf");
		const result = await Markdownify.toMarkdown({ filePath: pdfPath });

		expect(result).toBeDefined();
		expect(result.text).toContain("Test PDF content");
	},
	conversionTimeout,
);

test(
	"Markdownify.toMarkdown converts DOCX file to Markdown",
	async () => {
		const docxPath = path.join(sampleDataDir, "test.docx");
		const result = await Markdownify.toMarkdown({ filePath: docxPath });

		expect(result).toBeDefined();
		expect(result.text).toContain("Test DOCX content");
	},
	conversionTimeout,
);

test(
	"Markdownify.toMarkdown converts XLSX file to Markdown",
	async () => {
		const xlsxPath = path.join(sampleDataDir, "test.xlsx");
		const result = await Markdownify.toMarkdown({ filePath: xlsxPath });

		expect(result).toBeDefined();
		expect(result.text).toContain("Test XLSX content");
	},
	conversionTimeout,
);

test(
	"Markdownify.toMarkdown converts PPTX file to Markdown",
	async () => {
		const pptxPath = path.join(sampleDataDir, "test.pptx");
		const result = await Markdownify.toMarkdown({ filePath: pptxPath });

		expect(result).toBeDefined();
		expect(result.text).toContain("Test PPTX content");
	},
	conversionTimeout,
);

test(
	"Markdownify.toMarkdown converts image file to Markdown",
	async () => {
		const imagePath = path.join(sampleDataDir, "test.jpg");
		const result = await Markdownify.toMarkdown({ filePath: imagePath });

		expect(result).toBeDefined();
		// markitdown returns only whitespace for images without LLM vision config
		expect(result.text.trim()).toBe("");
	},
	conversionTimeout,
);

test(
	"Markdownify.toMarkdown converts URL content to Markdown",
	async () => {
		const testUrl = "https://93.184.216.34";
		const html = "<h1>Example Domain</h1>";
		const mockFetch = mock(() =>
			Promise.resolve({
				arrayBuffer: () =>
					Promise.resolve(new TextEncoder().encode(html).buffer),
			}),
		);
		global.fetch = mockFetch as any;

		const result = await Markdownify.toMarkdown({ url: testUrl });

		expect(result).toBeDefined();
		expect(result.text).toContain("# Example Domain");
	},
	conversionTimeout,
);

test("Markdownify.toMarkdown stores fetched URL content in a private random temp path and cleans up", async () => {
	const originalMarkitdown = Markdownify["_markitdown"];
	const testUrl = "https://93.184.216.34";
	const html = "<h1>Private Temp Path</h1>";
	let observedInputPath = "";

	global.fetch = mock(() =>
		Promise.resolve({
			arrayBuffer: () => Promise.resolve(new TextEncoder().encode(html).buffer),
		}),
	) as any;

	Markdownify["_markitdown"] = mock(async (inputPath: string) => {
		observedInputPath = inputPath;
		expect(fs.readFileSync(inputPath, "utf8")).toBe(html);
		return "# Private Temp Path";
	}) as any;

	try {
		const result = await Markdownify.toMarkdown({ url: testUrl });
		const tempDirName = path.basename(path.dirname(observedInputPath));

		expect(result.text).toBe("# Private Temp Path");
		expect(tempDirName.startsWith("markdownify-")).toBe(true);
		expect(path.basename(observedInputPath)).toMatch(
			/^markdown_output_[0-9a-f-]{36}\.html$/,
		);
		expect(fs.existsSync(path.dirname(observedInputPath))).toBe(false);
	} finally {
		Markdownify["_markitdown"] = originalMarkitdown;
	}
});

test("Markdownify.toMarkdown cleans up temp directory when _markitdown throws", async () => {
	const originalMarkitdown = Markdownify["_markitdown"];
	let observedInputPath = "";

	global.fetch = mock(() =>
		Promise.resolve({
			arrayBuffer: () =>
				Promise.resolve(new TextEncoder().encode("<p>boom</p>").buffer),
		}),
	) as any;

	Markdownify["_markitdown"] = mock(async (inputPath: string) => {
		observedInputPath = inputPath;
		throw new Error("Simulated markitdown failure");
	}) as any;

	try {
		await expect(
			Markdownify.toMarkdown({ url: "https://93.184.216.34" }),
		).rejects.toThrow("Simulated markitdown failure");
		expect(observedInputPath).not.toBe("");
		expect(fs.existsSync(path.dirname(observedInputPath))).toBe(false);
	} finally {
		Markdownify["_markitdown"] = originalMarkitdown;
	}
});

test("Markdownify.toMarkdown rejects SSRF URLs and redirects to private targets before fetching", async () => {
	const mockFetch = mock(() =>
		Promise.resolve({
			status: 302,
			headers: {
				get: (name: string) =>
					name.toLowerCase() === "location"
						? "http://[::ffff:7f00:1]:8080/secret"
						: null,
			},
			body: { cancel: () => Promise.resolve() },
		}),
	);
	global.fetch = mockFetch as any;

	await expect(
		Markdownify.toMarkdown({ url: "http://[::1]:8080/metadata" }),
	).rejects.toThrow("potentially dangerous");
	expect(mockFetch).toHaveBeenCalledTimes(0);

	await expect(
		Markdownify.toMarkdown({ url: "http://localhost:8080/metadata" }),
	).rejects.toThrow("potentially dangerous");
	expect(mockFetch).toHaveBeenCalledTimes(0);

	await expect(
		Markdownify.toMarkdown({ url: "https://93.184.216.34/start" }),
	).rejects.toThrow("potentially dangerous");
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

test("Markdownify.get retrieves existing Markdown file", async () => {
	const mdContent = "# Test Markdown\nThis is a test.";
	const tempFilePath = path.join(tempDir, "test_get.md");
	fs.writeFileSync(tempFilePath, mdContent);

	const result = await Markdownify.get({ filePath: tempFilePath });

	expect(result).toBeDefined();
	expect(result.path).toBe(tempFilePath);
	expect(result.text).toBe(mdContent);

	fs.unlinkSync(tempFilePath);
});

test("Markdownify.get expands ~ and reads from the resolved path", async () => {
	const mdContent = "# Tilde test\nbody";
	const dir = fs.mkdtempSync(path.join(tempDir, "mdfy-get-tilde-"));
	const mdFile = path.join(dir, "note.md");
	fs.writeFileSync(mdFile, mdContent);
	try {
		const relFromHome = path.relative(os.homedir(), mdFile);
		if (path.isAbsolute(relFromHome)) {
			// Cross-drive on Windows: cannot express via ~/...
			return;
		}
		const tildePath = `~/${relFromHome}`;
		const result = await Markdownify.get({ filePath: tildePath });
		expect(result).toBeDefined();
		expect(result.path).toBe(path.resolve(mdFile));
		expect(result.text).toBe(mdContent);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test(
	"Markdownify.toMarkdown throws error for non-existent file",
	async () => {
		const nonExistentPath = path.join(sampleDataDir, "non_existent.pdf");
		await expect(
			Markdownify.toMarkdown({ filePath: nonExistentPath }),
		).rejects.toThrow();
	},
	conversionTimeout,
);

test("Markdownify.toMarkdown throws error when neither filePath nor url is provided", async () => {
	await expect(Markdownify.toMarkdown({})).rejects.toThrow(
		"Either filePath or url must be provided",
	);
});

test("Markdownify.get throws error for non-existent file", async () => {
	const nonExistentPath = path.join(sampleDataDir, "non_existent.md");
	await expect(Markdownify.get({ filePath: nonExistentPath })).rejects.toThrow(
		"File does not exist",
	);
});

test("Markdownify.fromRepo converts a git repo to markdown via shorthand", async () => {
	const result = await Markdownify.fromRepo({
		repoUrl: "octocat/Hello-World",
	});

	expect(result).toBeDefined();
	expect(result.text).toContain("File: README");
	expect(result.text).toContain("Hello World!");
}, 60_000);

test("Markdownify.fromRepo works with full GitHub URL", async () => {
	const result = await Markdownify.fromRepo({
		repoUrl: "https://github.com/octocat/Hello-World",
	});

	expect(result).toBeDefined();
	expect(result.text).toContain("README");
}, 60_000);

test("Markdownify.fromRepo supports branch parameter", async () => {
	const result = await Markdownify.fromRepo({
		repoUrl: "octocat/Hello-World",
		branch: "master",
	});

	expect(result).toBeDefined();
	expect(result.text).toContain("README");
}, 60_000);

test("Markdownify.fromRepo supports compress parameter", async () => {
	const normal = await Markdownify.fromRepo({
		repoUrl: "octocat/Hello-World",
	});
	const compressed = await Markdownify.fromRepo({
		repoUrl: "octocat/Hello-World",
		compress: true,
	});

	expect(compressed).toBeDefined();
	expect(compressed.text).toBeTruthy();
	// Compressed output should differ from normal (may be shorter or structured differently)
	expect(compressed.text).not.toEqual(normal.text);
}, 120_000);

test("Markdownify.fromRepo throws error for invalid repo", async () => {
	await expect(
		Markdownify.fromRepo({ repoUrl: "not-a-real-owner/not-a-real-repo-xyz" }),
	).rejects.toThrow();
}, 30_000);

test("Markdownify.fromRepo rejects empty URL", async () => {
	await expect(Markdownify.fromRepo({ repoUrl: "" })).rejects.toThrow(
		"Repository URL is required",
	);
});

test("Markdownify.fromRepo rejects file:// URLs", async () => {
	await expect(
		Markdownify.fromRepo({ repoUrl: "file:///etc/passwd" }),
	).rejects.toThrow("Only http: and https: repository URLs are allowed");
});

test("Markdownify.fromRepo rejects shell metacharacters in URL", async () => {
	await expect(
		Markdownify.fromRepo({ repoUrl: "owner/repo; rm -rf /" }),
	).rejects.toThrow("Invalid repository URL or shorthand");
});

test("Markdownify.fromRepo rejects scp-style SSH shorthand and private URLs", async () => {
	await expect(
		Markdownify.fromRepo({ repoUrl: "git@internal.local:owner/repo.git" }),
	).rejects.toThrow("scp-style SSH syntax");
	await expect(
		Markdownify.fromRepo({ repoUrl: "http://127.0.0.1/owner/repo" }),
	).rejects.toThrow("potentially dangerous");
});

test("Markdownify.fromRepo rejects option injection in branch parameter", async () => {
	await expect(
		Markdownify.fromRepo({
			repoUrl: "octocat/Hello-World",
			branch: "--upload-pack=id",
		}),
	).rejects.toThrow("Invalid branch name");
});

// Integration tests against diverse real repositories
test("Markdownify.fromRepo handles a TypeScript repo (sindresorhus/is)", async () => {
	const result = await Markdownify.fromRepo({
		repoUrl: "sindresorhus/is",
	});

	expect(result).toBeDefined();
	expect(result.text.length).toBeGreaterThan(1000);
	expect(result.text).toContain("package.json");
	expect(result.text).toContain("tsconfig");
}, 120_000);

test("Markdownify.fromRepo handles a Python repo (pallets/click)", async () => {
	const result = await Markdownify.fromRepo({
		repoUrl: "pallets/click",
	});

	expect(result).toBeDefined();
	expect(result.text.length).toBeGreaterThan(1000);
	expect(result.text).toContain(".py");
}, 120_000);

test("Markdownify.fromRepo handles a Rust repo (BurntSushi/ripgrep)", async () => {
	const result = await Markdownify.fromRepo({
		repoUrl: "BurntSushi/ripgrep",
	});

	expect(result).toBeDefined();
	expect(result.text.length).toBeGreaterThan(5000);
	expect(result.text).toContain("Cargo.toml");
}, 120_000);

test("Markdownify.fromRepo handles a Go repo (junegunn/fzf)", async () => {
	const result = await Markdownify.fromRepo({
		repoUrl: "junegunn/fzf",
	});

	expect(result).toBeDefined();
	expect(result.text.length).toBeGreaterThan(5000);
	expect(result.text).toContain("go.mod");
}, 120_000);

test("Markdownify.fromRepo handles full GitLab-style HTTPS URL", async () => {
	const result = await Markdownify.fromRepo({
		repoUrl: "https://github.com/kelseyhightower/nocode",
	});

	expect(result).toBeDefined();
	expect(result.text).toContain("README");
}, 60_000);

test("Markdownify.fromRepo handles a specific tag via branch param", async () => {
	const result = await Markdownify.fromRepo({
		repoUrl: "sindresorhus/is",
		branch: "v6.0.0",
	});

	expect(result).toBeDefined();
	expect(result.text).toContain("package.json");
}, 120_000);

test("Markdownify.fromRepo compress works on a multi-file repo", async () => {
	const result = await Markdownify.fromRepo({
		repoUrl: "sindresorhus/is",
		compress: true,
	});

	expect(result).toBeDefined();
	expect(result.text.length).toBeGreaterThan(500);
}, 120_000);

test("Markdownify.toMarkdown passes a YouTube watch URL directly to markitdown", async () => {
	const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
	const originalValidate = Markdownify["_validateUrlDestination"];
	const originalMarkitdown = Markdownify["_markitdown"];
	let receivedArg: string | undefined;

	Markdownify["_validateUrlDestination"] = mock(async () => {}) as any;
	global.fetch = mock(() =>
		Promise.resolve({
			status: 200,
			headers: { get: () => null },
			body: { cancel: () => Promise.resolve() },
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
		}),
	) as any;
	Markdownify["_markitdown"] = mock(async (arg: string) => {
		receivedArg = arg;
		return "# YouTube\n\n### Transcript\nmocked";
	}) as any;

	try {
		await Markdownify.toMarkdown({ url: testUrl });
	} finally {
		Markdownify["_validateUrlDestination"] = originalValidate;
		Markdownify["_markitdown"] = originalMarkitdown;
	}

	expect(receivedArg).toBe(testUrl);
});

test("Markdownify.toMarkdown resolves a youtu.be redirect before passing URL to markitdown", async () => {
	const shortUrl = "https://youtu.be/dQw4w9WgXcQ";
	const resolvedUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
	const originalValidate = Markdownify["_validateUrlDestination"];
	const originalMarkitdown = Markdownify["_markitdown"];
	let receivedArg: string | undefined;

	Markdownify["_validateUrlDestination"] = mock(async () => {}) as any;
	global.fetch = mock((url: string) => {
		if (url === shortUrl) {
			return Promise.resolve({
				status: 303,
				headers: {
					get: (h: string) => (h === "location" ? resolvedUrl : null),
				},
				body: { cancel: () => Promise.resolve() },
			});
		}
		return Promise.resolve({
			status: 200,
			headers: { get: () => null },
			body: { cancel: () => Promise.resolve() },
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
		});
	}) as any;
	Markdownify["_markitdown"] = mock(async (arg: string) => {
		receivedArg = arg;
		return "ok";
	}) as any;

	try {
		await Markdownify.toMarkdown({ url: shortUrl });
	} finally {
		Markdownify["_validateUrlDestination"] = originalValidate;
		Markdownify["_markitdown"] = originalMarkitdown;
	}

	expect(receivedArg).toBe(resolvedUrl);
});

test("Markdownify.toMarkdown still downloads non-allowlisted URLs to a private temp file", async () => {
	const testUrl = "https://93.184.216.34/page";
	const html = "<h1>Example Domain</h1>";
	const originalMarkitdown = Markdownify["_markitdown"];
	let receivedArg: string | undefined;

	global.fetch = mock(() =>
		Promise.resolve({
			status: 200,
			headers: { get: () => null },
			body: null,
			arrayBuffer: () => Promise.resolve(new TextEncoder().encode(html).buffer),
		}),
	) as any;
	Markdownify["_markitdown"] = mock(async (arg: string) => {
		receivedArg = arg;
		return "# Example Domain";
	}) as any;

	try {
		await Markdownify.toMarkdown({ url: testUrl });
	} finally {
		Markdownify["_markitdown"] = originalMarkitdown;
	}

	expect(receivedArg).not.toBe(testUrl);
	expect(receivedArg).toContain("markdown_output_");
});

test("Markdownify.toMarkdown handles error from _markitdown method", async () => {
	const originalMarkitdown = Markdownify["_markitdown"];
	Markdownify["_markitdown"] = mock(() => {
		throw new Error("Mocked _markitdown error");
	});

	const pdfPath = path.join(sampleDataDir, "test.pdf");
	await expect(Markdownify.toMarkdown({ filePath: pdfPath })).rejects.toThrow(
		"Error processing to Markdown: Mocked _markitdown error",
	);

	Markdownify["_markitdown"] = originalMarkitdown;
});
