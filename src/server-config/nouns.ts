export type TransportMode = "stdio" | "http";

export type ServerConfiguration = {
	readonly transport: TransportMode;
	readonly port: number;
	readonly host: string;
	readonly allowedHosts: readonly string[];
	readonly allowedOrigins: readonly string[];
	readonly allowUnrestrictedPaths: boolean;
};

export type HttpGuardConfig = {
	readonly host: string;
	readonly allowedHosts: readonly string[];
	readonly allowedOrigins: readonly string[];
};

export type IncomingHttpRequest = {
	readonly method: string;
	readonly pathname: string;
	readonly hostHeader?: string;
	readonly originHeader?: string;
};

export type HttpRequestGuardResult =
	| { readonly allowed: true }
	| {
			readonly allowed: false;
			readonly status: 403 | 404 | 405;
			readonly message: string;
			readonly allowHeader?: "POST";
	  };

export type StartupNotice = {
	readonly level: "notice" | "warning";
	readonly message: string;
};
