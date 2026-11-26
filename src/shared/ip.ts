import { BlockList, isIP } from "node:net";

const PRIVATE_IP_BLOCKLIST = new BlockList();
// Non-public IPv4 ranges (IANA Special-Purpose Address Registry)
PRIVATE_IP_BLOCKLIST.addSubnet("0.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("100.64.0.0", 10, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("169.254.0.0", 16, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("192.0.0.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("192.0.2.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("198.18.0.0", 15, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("198.51.100.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("203.0.113.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("224.0.0.0", 4, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("240.0.0.0", 4, "ipv4");
// Non-public IPv6 ranges (BlockList also maps ::ffff:0:0/96 onto IPv4 rules)
PRIVATE_IP_BLOCKLIST.addSubnet("::", 128, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::1", 128, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::", 96, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("64:ff9b::", 96, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("64:ff9b:1::", 48, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("100::", 64, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("2001::", 32, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("2001:2::", 48, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("2001:db8::", 32, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("2002::", 16, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("fc00::", 7, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("fe80::", 10, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("fec0::", 10, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("ff00::", 8, "ipv6");

export function normalizeHostname(hostname: string): string {
	const unwrapped = hostname.replace(/^\[(.*)\]$/, "$1");
	const withoutZone = unwrapped.split("%")[0] ?? unwrapped;
	return withoutZone.replace(/\.+$/, "").toLowerCase();
}

export function isPrivateOrReservedIp(address: string): boolean {
	const normalized = normalizeHostname(address);
	const family = isIP(normalized);
	if (family === 4) {
		return PRIVATE_IP_BLOCKLIST.check(normalized, "ipv4");
	}
	if (family === 6) {
		return PRIVATE_IP_BLOCKLIST.check(normalized, "ipv6");
	}
	return false;
}
