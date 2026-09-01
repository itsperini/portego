export interface DiscoverArguments {
  command: "discover";
  timeoutMs: number;
  requestTimeoutMs: number;
  hosts: string[];
  includeMdns: boolean;
  json: boolean;
}

export type CliArguments = DiscoverArguments | { command: "help" };

function readPositiveSeconds(value: string | undefined, flag: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`${flag} must be a positive number of seconds.`);
  }
  return Math.round(seconds * 1_000);
}

export function parseArguments(rawArguments: string[]): CliArguments {
  const args = [...rawArguments];
  if (args[0] === "gateway") {
    args.shift();
  }

  const command = args.shift();
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { command: "help" };
  }
  if (command !== "discover") {
    throw new Error(`Unknown command: ${command}`);
  }

  const parsed: DiscoverArguments = {
    command: "discover",
    timeoutMs: 6_000,
    requestTimeoutMs: 2_000,
    hosts: [],
    includeMdns: true,
    json: false,
  };

  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case "--":
        break;
      case "--timeout":
        parsed.timeoutMs = readPositiveSeconds(args.shift(), flag);
        break;
      case "--request-timeout":
        parsed.requestTimeoutMs = readPositiveSeconds(args.shift(), flag);
        break;
      case "--host": {
        const host = args.shift();
        if (!host) {
          throw new Error("--host requires an IP address, hostname, or URL.");
        }
        parsed.hosts.push(host);
        break;
      }
      case "--no-mdns":
        parsed.includeMdns = false;
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--help":
      case "-h":
        return { command: "help" };
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  if (!parsed.includeMdns && parsed.hosts.length === 0) {
    throw new Error("Provide at least one --host when mDNS is disabled.");
  }
  return parsed;
}
