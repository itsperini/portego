export interface OutputArguments {
  json: boolean;
}

export interface DiscoverArguments extends OutputArguments {
  command: "discover";
  timeoutMs: number;
  hosts: string[];
  includeMdns: boolean;
  includeBle: boolean;
  includeNeighbors: boolean;
  includeUnknown: boolean;
}

export interface CandidateArguments extends OutputArguments {
  command: "candidate";
  candidateId: string;
}

export interface CommissionArguments extends OutputArguments {
  command: "commission";
  candidateId: string;
  confirmed: boolean;
  inputFromStdin: boolean;
}

export interface DeviceArguments extends OutputArguments {
  command: "refresh";
  deviceId: string;
}

export interface SetupArguments extends OutputArguments {
  command: "setup";
  apiUrl: string;
  gatewayName: string;
}

export type CliArguments =
  | DiscoverArguments
  | CandidateArguments
  | CommissionArguments
  | DeviceArguments
  | SetupArguments
  | ({ command: "capabilities" | "inventory" } & OutputArguments)
  | { command: "help" };

function readPositiveSeconds(value: string | undefined, flag: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`${flag} must be a positive number of seconds.`);
  }
  return Math.round(seconds * 1_000);
}

function requireValue(args: string[], flag: string): string {
  const value = args.shift();
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function outputOnly(command: "capabilities" | "inventory", args: string[]): CliArguments {
  let json = false;
  for (const flag of args) {
    if (flag === "--" || flag === "--json") {
      json ||= flag === "--json";
    } else if (flag === "--help" || flag === "-h") {
      return { command: "help" };
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return { command, json };
}

export function parseArguments(rawArguments: string[]): CliArguments {
  const args = [...rawArguments];
  if (args[0] === "gateway") args.shift();
  if (args[0] === "--") args.shift();
  const command = args.shift();
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { command: "help" };
  }
  if (command === "capabilities" || command === "inventory") {
    return outputOnly(command, args);
  }
  if (command === "setup") {
    const parsed: SetupArguments = {
      command: "setup",
      apiUrl: process.env.PORTEGO_API_URL ?? "http://localhost:4000",
      gatewayName: process.env.PORTEGO_GATEWAY_NAME ?? "Portego home gateway",
      json: false,
    };
    while (args.length > 0) {
      const flag = args.shift();
      if (flag === "--") continue;
      if (flag === "--api") parsed.apiUrl = requireValue(args, flag);
      else if (flag === "--name") parsed.gatewayName = requireValue(args, flag);
      else if (flag === "--json") parsed.json = true;
      else if (flag === "--help" || flag === "-h") return { command: "help" };
      else throw new Error(`Unknown option: ${flag}`);
    }
    return parsed;
  }
  if (command === "candidate") {
    const candidateId = requireValue(args, "candidate");
    const output = outputOnly("inventory", args);
    if (output.command === "help") return output;
    return { command: "candidate", candidateId, json: output.json };
  }
  if (command === "refresh") {
    const deviceId = requireValue(args, "refresh");
    const output = outputOnly("inventory", args);
    if (output.command === "help") return output;
    return { command: "refresh", deviceId, json: output.json };
  }
  if (command === "add" || command === "commission") {
    const candidateId = requireValue(args, command);
    const parsed: CommissionArguments = {
      command: "commission",
      candidateId,
      confirmed: false,
      inputFromStdin: false,
      json: false,
    };
    for (const flag of args) {
      if (flag === "--") continue;
      if (flag === "--confirm") parsed.confirmed = true;
      else if (flag === "--input-stdin") parsed.inputFromStdin = true;
      else if (flag === "--json") parsed.json = true;
      else if (flag === "--help" || flag === "-h") return { command: "help" };
      else throw new Error(`Unknown option: ${flag}`);
    }
    return parsed;
  }
  if (command !== "discover") throw new Error(`Unknown command: ${command}`);

  const parsed: DiscoverArguments = {
    command: "discover",
    timeoutMs: 6_000,
    hosts: [],
    includeMdns: true,
    includeBle: false,
    includeNeighbors: false,
    includeUnknown: false,
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
      case "--host":
        parsed.hosts.push(requireValue(args, flag));
        break;
      case "--no-mdns":
        parsed.includeMdns = false;
        break;
      case "--ble":
        parsed.includeBle = true;
        break;
      case "--neighbors":
        parsed.includeNeighbors = true;
        break;
      case "--all":
        parsed.includeUnknown = true;
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
