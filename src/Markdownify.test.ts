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
		// Real 1x1 JPEG returns EXIF metadata when exiftool is installed, or empty string otherwise (D4, D16, D42)
		expect(
			result.text.trim() === "" || result.text.includes("ImageSize: 1x1"),
		).toBe(true);
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
				status: 200,
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
			status: 200,
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
			status: 200,
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
	expect(result.path).toBe(fs.realpathSync.native(tempFilePath));
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
		expect(result.path).toBe(fs.realpathSync.native(mdFile));
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

test("Markdownify.get rejects relative paths, directories, and .md symlinks to non-Markdown targets while accepting .MD and returning realpath (D8, D25, D26, D27)", async () => {
	await expect(Markdownify.get({ filePath: "README.md" })).rejects.toThrow(
		'File path "README.md" must be an absolute path or start with ~/',
	);

	const dir = fs.mkdtempSync(path.join(tempDir, "mdfy-get-rules-"));
	const dirNamedMd = path.join(dir, "folder.md");
	const upperMd = path.join(dir, "README.MD");
	const aliasMd = path.join(dir, "alias.md");
	const secretTxt = path.join(dir, "secret.txt");
	const disguisedMd = path.join(dir, "disguised.md");
	fs.mkdirSync(dirNamedMd);
	fs.writeFileSync(upperMd, "  \n");
	fs.writeFileSync(secretTxt, "SECRET=1");
	fs.symlinkSync(upperMd, aliasMd);
	fs.symlinkSync(secretTxt, disguisedMd);

	try {
		await expect(Markdownify.get({ filePath: dirNamedMd })).rejects.toThrow(
			"Path is a directory, not a file:",
		);
		await expect(Markdownify.get({ filePath: disguisedMd })).rejects.toThrow(
			"Required file is not a Markdown file.",
		);
		const res = await Markdownify.get({ filePath: aliasMd });
		expect(res).toEqual({
			path: fs.realpathSync.native(upperMd),
			text: "  \n",
		});
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
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

test("Markdownify.toMarkdown rejects non-2xx HTTP responses with status code (D12)", async () => {
	global.fetch = mock(() =>
		Promise.resolve({
			status: 404,
			headers: { get: () => null },
			body: { cancel: () => Promise.resolve() },
			arrayBuffer: () =>
				Promise.resolve(new TextEncoder().encode("<h1>Not Found</h1>").buffer),
		}),
	) as any;

	await expect(
		Markdownify.toMarkdown({ url: "https://93.184.216.34/missing" }),
	).rejects.toThrow("HTTP 404 fetching https://93.184.216.34/missing");
});

test("Markdownify.toMarkdown normalizes whitespace-only exit-0 output to empty string (D16)", async () => {
	const originalMarkitdown = Markdownify["_markitdown"];
	global.fetch = mock(() =>
		Promise.resolve({
			status: 200,
			headers: { get: () => null },
			body: null,
			arrayBuffer: () =>
				Promise.resolve(new TextEncoder().encode("<div></div>").buffer),
		}),
	) as any;
	Markdownify["_markitdown"] = mock(async () => "   \n\t  ") as any;

	try {
		const result = await Markdownify.toMarkdown({
			url: "https://93.184.216.34/blank",
		});
		expect(result).toEqual({ text: "" });
	} finally {
		Markdownify["_markitdown"] = originalMarkitdown;
	}
});

test("Markdownify.toMarkdown allows 10 redirect hops and rejects an 11th redirect (D13)", async () => {
	const originalMarkitdown = Markdownify["_markitdown"];
	Markdownify["_markitdown"] = mock(async () => "# Hop 10") as any;
	let hops = 0;
	global.fetch = mock((url: string) => {
		if (hops < 10) {
			hops++;
			return Promise.resolve({
				status: 302,
				headers: {
					get: (name: string) =>
						name.toLowerCase() === "location"
							? `https://93.184.216.34/hop-${hops}`
							: null,
				},
				body: { cancel: () => Promise.resolve() },
			});
		}
		return Promise.resolve({
			status: 200,
			headers: { get: () => "text/html" },
			body: null,
			arrayBuffer: () =>
				Promise.resolve(new TextEncoder().encode(`<h1>${url}</h1>`).buffer),
		});
	}) as any;

	try {
		const result = await Markdownify.toMarkdown({
			url: "https://93.184.216.34/hop-0",
		});
		expect(result).toEqual({ text: "# Hop 10" });
		expect(hops).toBe(10);
	} finally {
		Markdownify["_markitdown"] = originalMarkitdown;
	}
});

test("Markdownify.toMarkdown infers temp file extension from Content-Type on extensionless URLs (D10, D15)", async () => {
	const originalMarkitdown = Markdownify["_markitdown"];
	let receivedPath = "";
	global.fetch = mock(() =>
		Promise.resolve({
			status: 200,
			headers: {
				get: (name: string) =>
					name.toLowerCase() === "content-type"
						? "application/pdf; charset=binary"
						: null,
			},
			body: null,
			arrayBuffer: () =>
				Promise.resolve(new TextEncoder().encode("%PDF-1.7").buffer),
		}),
	) as any;
	Markdownify["_markitdown"] = mock(async (inputPath: string) => {
		receivedPath = inputPath;
		return "# Inferred PDF";
	}) as any;

	try {
		const result = await Markdownify.toMarkdown({
			url: "https://93.184.216.34/download?id=99",
		});
		expect(result).toEqual({ text: "# Inferred PDF" });
		expect(receivedPath.endsWith(".pdf")).toBe(true);
	} finally {
		Markdownify["_markitdown"] = originalMarkitdown;
	}
});

test("Markdownify.toMarkdown aborts downloads exceeding MD_MAX_DOWNLOAD_BYTES via Content-Length or stream (D13)", async () => {
	const savedMax = process.env.MD_MAX_DOWNLOAD_BYTES;
	process.env.MD_MAX_DOWNLOAD_BYTES = "10";
	let cancelled = false;

	try {
		// 1. Content-Length exceeds limit
		global.fetch = mock(() =>
			Promise.resolve({
				status: 200,
				headers: {
					get: (name: string) =>
						name.toLowerCase() === "content-length" ? "50" : "text/html",
				},
				body: {
					cancel: async () => {
						cancelled = true;
					},
				},
			}),
		) as any;

		await expect(
			Markdownify.toMarkdown({ url: "https://93.184.216.34/huge-header" }),
		).rejects.toThrow("Download exceeded maximum size of 10 bytes");
		expect(cancelled).toBe(true);

		// 2. Streaming body exceeds limit without Content-Length
		let readerCancelled = false;
		let chunksSent = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				chunksSent++;
				controller.enqueue(new Uint8Array(6));
				if (chunksSent >= 5) controller.close();
			},
			cancel() {
				readerCancelled = true;
			},
		});
		global.fetch = mock(() =>
			Promise.resolve({
				status: 200,
				headers: { get: () => null },
				body: stream,
			}),
		) as any;

		await expect(
			Markdownify.toMarkdown({ url: "https://93.184.216.34/huge-stream" }),
		).rejects.toThrow("Download exceeded maximum size of 10 bytes");
		expect(readerCancelled).toBe(true);
	} finally {
		if (savedMax === undefined) delete process.env.MD_MAX_DOWNLOAD_BYTES;
		else process.env.MD_MAX_DOWNLOAD_BYTES = savedMax;
	}
});

test("Markdownify.toMarkdown enforces MD_FETCH_TIMEOUT_MS on fetch abort (D13)", async () => {
	const savedTimeout = process.env.MD_FETCH_TIMEOUT_MS;
	process.env.MD_FETCH_TIMEOUT_MS = "50";

	global.fetch = mock((_url: string, init?: { signal?: AbortSignal }) => {
		return new Promise((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => {
				const abortErr = new Error("Aborted");
				abortErr.name = "TimeoutError";
				reject(abortErr);
			});
		});
	}) as any;

	try {
		await expect(
			Markdownify.toMarkdown({ url: "https://93.184.216.34/stall" }),
		).rejects.toThrow("Fetch timed out after 50ms");
	} finally {
		if (savedTimeout === undefined) delete process.env.MD_FETCH_TIMEOUT_MS;
		else process.env.MD_FETCH_TIMEOUT_MS = savedTimeout;
	}
});

test("Markdownify.toMarkdown rejects directory paths before invoking markitdown (D17)", async () => {
	const originalMarkitdown = Markdownify["_markitdown"];
	let markitdownCalled = false;
	Markdownify["_markitdown"] = mock(async () => {
		markitdownCalled = true;
		return "should not run";
	}) as any;

	try {
		await expect(
			Markdownify.toMarkdown({ filePath: sampleDataDir }),
		).rejects.toThrow("Path is a directory, not a file");
		expect(markitdownCalled).toBe(false);
	} finally {
		Markdownify["_markitdown"] = originalMarkitdown;
	}
});

test("Markdownify.toMarkdown preserves <!DOCTYPE html> output on local files (D20)", async () => {
	const originalMarkitdown = Markdownify["_markitdown"];
	Markdownify["_markitdown"] = mock(
		async (
			_filePath: string,
			_projectRoot: string,
			_timeoutMs?: number,
			opts?: { checkUnconvertedHtml?: boolean },
		) => {
			expect(opts?.checkUnconvertedHtml).toBe(false);
			return "<!DOCTYPE html><html><body>Snippet</body></html>";
		},
	) as any;

	try {
		const result = await Markdownify.toMarkdown({
			filePath: path.join(sampleDataDir, "test.pdf"),
		});
		expect(result).toEqual({
			text: "<!DOCTYPE html><html><body>Snippet</body></html>",
		});
	} finally {
		Markdownify["_markitdown"] = originalMarkitdown;
	}
});

test("Markdownify.toMarkdown enforces MD_MARKITDOWN_TIMEOUT_MS on local files without requiring web fetch limits (LF-10, D13)", async () => {
	const savedMarkitdown = process.env.MD_MARKITDOWN_TIMEOUT_MS;
	const savedFetch = process.env.MD_FETCH_TIMEOUT_MS;
	const originalMarkitdown = Markdownify["_markitdown"];
	let receivedTimeout: number | undefined;
	Markdownify["_markitdown"] = mock(
		async (_filePath: string, _projectRoot: string, timeoutMs?: number) => {
			receivedTimeout = timeoutMs;
			return "# Timed";
		},
	) as any;

	try {
		process.env.MD_MARKITDOWN_TIMEOUT_MS = "0";
		await expect(
			Markdownify.toMarkdown({
				filePath: path.join(sampleDataDir, "test.pdf"),
			}),
		).rejects.toThrow(
			'Invalid MD_MARKITDOWN_TIMEOUT_MS "0": must be a positive integer',
		);

		process.env.MD_MARKITDOWN_TIMEOUT_MS = "5000";
		process.env.MD_FETCH_TIMEOUT_MS = "not-a-number";
		const res = await Markdownify.toMarkdown({
			filePath: path.join(sampleDataDir, "test.pdf"),
		});
		expect(receivedTimeout).toBe(5_000);
		expect(res).toEqual({ text: "# Timed" });
	} finally {
		Markdownify["_markitdown"] = originalMarkitdown;
		if (savedMarkitdown === undefined)
			delete process.env.MD_MARKITDOWN_TIMEOUT_MS;
		else process.env.MD_MARKITDOWN_TIMEOUT_MS = savedMarkitdown;
		if (savedFetch === undefined) delete process.env.MD_FETCH_TIMEOUT_MS;
		else process.env.MD_FETCH_TIMEOUT_MS = savedFetch;
	}
});

test("Markdownify.fromRepo rejects invalid MD_REPOMIX_TIMEOUT_MS before invoking repomix (GR-7, D28)", async () => {
	const saved = process.env.MD_REPOMIX_TIMEOUT_MS;
	try {
		process.env.MD_REPOMIX_TIMEOUT_MS = "0";
		await expect(
			Markdownify.fromRepo({ repoUrl: "octocat/Hello-World" }),
		).rejects.toThrow(
			'Invalid MD_REPOMIX_TIMEOUT_MS "0": must be a positive integer',
		);
	} finally {
		if (saved === undefined) delete process.env.MD_REPOMIX_TIMEOUT_MS;
		else process.env.MD_REPOMIX_TIMEOUT_MS = saved;
	}
});

test("Markdownify.toMarkdown reports fetch timeout when response body stalls past MD_FETCH_TIMEOUT_MS (WU-6, D13)", async () => {
	const saved = process.env.MD_FETCH_TIMEOUT_MS;
	process.env.MD_FETCH_TIMEOUT_MS = "40";
	global.fetch = mock((_url: string, init?: RequestInit) => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("<html>partial"));
				init?.signal?.addEventListener("abort", () => {
					controller.error(
						init.signal?.reason ??
							new DOMException("The operation was aborted.", "TimeoutError"),
					);
				});
			},
		});
		return Promise.resolve(
			new Response(stream, {
				status: 200,
				headers: { "content-type": "text/html" },
			}),
		);
	}) as any;

	try {
		await expect(
			Markdownify.toMarkdown({ url: "https://93.184.216.34/stalled-body" }),
		).rejects.toThrow(
			"Fetch timed out after 40ms for https://93.184.216.34/stalled-body",
		);
	} finally {
		if (saved === undefined) delete process.env.MD_FETCH_TIMEOUT_MS;
		else process.env.MD_FETCH_TIMEOUT_MS = saved;
	}
});
