import { createHash } from "node:crypto";
import type { DiscoveredAddress, DiscoveryCandidate, DiscoveryObservation } from "./types.js";

function normalizedIdentityHint(hint: string): string {
  return hint.trim().toLowerCase();
}

function observationKeys(observation: DiscoveryObservation): Set<string> {
  const keys = new Set(observation.identityHints.map(normalizedIdentityHint));
  for (const address of observation.addresses) {
    keys.add(`address:${address.host.toLowerCase()}`);
  }
  return keys;
}

function uniqueAddresses(observations: DiscoveryObservation[]): DiscoveredAddress[] {
  const addresses = new Map<string, DiscoveredAddress>();
  for (const observation of observations) {
    for (const address of observation.addresses) {
      const key = [address.protocol, address.host.toLowerCase(), address.port].join(":");
      addresses.set(key, address);
    }
  }
  return [...addresses.values()];
}

function opaqueCandidateId(keys: Set<string>, observations: DiscoveryObservation[]): string {
  const stableKeys = [...keys].filter((key) => !key.startsWith("address:")).sort();
  const source = stableKeys.length > 0 ? stableKeys : [...keys].sort();
  const fallback = observations.map((observation) => observation.providerId).sort();
  const digest = createHash("sha256")
    .update(JSON.stringify(source.length > 0 ? source : fallback))
    .digest("hex")
    .slice(0, 16);
  return `candidate_${digest}`;
}

function candidateName(observations: DiscoveryObservation[]): string {
  return (
    observations.find((observation) => observation.name && !/^https?:/i.test(observation.name))
      ?.name ?? "Unidentified smart device"
  );
}

interface ObservationGroup {
  observations: DiscoveryObservation[];
  keys: Set<string>;
}

export function aggregateObservations(observations: DiscoveryObservation[]): DiscoveryCandidate[] {
  const groups: ObservationGroup[] = [];

  for (const observation of observations) {
    const keys = observationKeys(observation);
    const matchingGroups = groups.filter((group) => [...keys].some((key) => group.keys.has(key)));
    if (matchingGroups.length === 0) {
      groups.push({ observations: [observation], keys });
      continue;
    }

    const primary = matchingGroups[0];
    if (!primary) {
      continue;
    }
    primary.observations.push(observation);
    for (const key of keys) {
      primary.keys.add(key);
    }

    for (const duplicate of matchingGroups.slice(1)) {
      primary.observations.push(...duplicate.observations);
      for (const key of duplicate.keys) {
        primary.keys.add(key);
      }
      groups.splice(groups.indexOf(duplicate), 1);
    }
  }

  return groups
    .map((group) => ({
      id: opaqueCandidateId(group.keys, group.observations),
      displayName: candidateName(group.observations),
      transports: [...new Set(group.observations.map((observation) => observation.transport))],
      addresses: uniqueAddresses(group.observations),
      serviceTypes: [
        ...new Set(group.observations.flatMap((observation) => observation.serviceTypes)),
      ].sort(),
      observations: group.observations,
      matches: [],
      warnings: [],
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}
