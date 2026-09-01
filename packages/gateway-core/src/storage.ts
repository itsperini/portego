import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  type CredentialVault,
  type DiscoveredDevice,
  type DiscoverySession,
  discoverySessionSchema,
  type Inventory,
  inventorySchema,
} from "./types.js";

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function atomicJsonWrite(path: string, value: unknown, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await rename(temporaryPath, path);
  await chmod(path, mode);
}

export function defaultGatewayStateDirectory(): string {
  return process.env.PORTEGO_STATE_DIR ?? join(homedir(), ".portego");
}

const gatewayCloudCredentialsSchema = z.object({
  version: z.literal(1),
  apiUrl: z.string().url(),
  websocketUrl: z.string().url(),
  gatewayId: z.string().min(1),
  gatewayToken: z.string().min(20),
  claimedAt: z.string().datetime(),
});

export type GatewayCloudCredentials = z.infer<typeof gatewayCloudCredentialsSchema>;

export class GatewayCloudCredentialsStore {
  readonly #path: string;

  constructor(stateDirectory = defaultGatewayStateDirectory()) {
    this.#path = join(stateDirectory, "cloud.json");
  }

  async read(): Promise<GatewayCloudCredentials | undefined> {
    const value = await readJson(this.#path);
    return value === undefined ? undefined : gatewayCloudCredentialsSchema.parse(value);
  }

  async write(credentials: GatewayCloudCredentials): Promise<void> {
    await atomicJsonWrite(this.#path, gatewayCloudCredentialsSchema.parse(credentials));
  }
}

export class GatewayStateStore {
  readonly #stateDirectory: string;

  constructor(stateDirectory = defaultGatewayStateDirectory()) {
    this.#stateDirectory = stateDirectory;
  }

  get stateDirectory(): string {
    return this.#stateDirectory;
  }

  async saveDiscoverySession(session: DiscoverySession): Promise<void> {
    const parsed = discoverySessionSchema.parse(session);
    await atomicJsonWrite(join(this.#stateDirectory, "discovery", "latest.json"), parsed);
  }

  async latestDiscoverySession(): Promise<DiscoverySession | undefined> {
    const value = await readJson(join(this.#stateDirectory, "discovery", "latest.json"));
    return value === undefined ? undefined : discoverySessionSchema.parse(value);
  }

  async getCandidate(candidateId: string) {
    const session = await this.latestDiscoverySession();
    return session?.candidates.find((candidate) => candidate.id === candidateId);
  }

  async inventory(): Promise<Inventory> {
    const value = await readJson(join(this.#stateDirectory, "inventory.json"));
    return value === undefined
      ? { schemaVersion: 1, devices: [], updatedAt: new Date(0).toISOString() }
      : inventorySchema.parse(value);
  }

  async saveDevice(device: DiscoveredDevice): Promise<void> {
    const inventory = await this.inventory();
    const existingIndex = inventory.devices.findIndex((existing) => existing.id === device.id);
    if (existingIndex === -1) {
      inventory.devices.push(device);
    } else {
      inventory.devices[existingIndex] = device;
    }
    inventory.updatedAt = new Date().toISOString();
    await atomicJsonWrite(
      join(this.#stateDirectory, "inventory.json"),
      inventorySchema.parse(inventory),
    );
  }

  async removeDevice(deviceId: string): Promise<void> {
    const inventory = await this.inventory();
    inventory.devices = inventory.devices.filter((device) => device.id !== deviceId);
    inventory.updatedAt = new Date().toISOString();
    await atomicJsonWrite(
      join(this.#stateDirectory, "inventory.json"),
      inventorySchema.parse(inventory),
    );
  }
}

interface EncryptedVaultDocument {
  version: 1;
  values: Record<string, { iv: string; tag: string; ciphertext: string }>;
}

function decodeEnvironmentKey(value: string): Buffer {
  const encoding = /^[a-fA-F0-9]{64}$/.test(value) ? "hex" : "base64";
  const key = Buffer.from(value, encoding);
  if (key.length !== 32) {
    throw new Error("PORTEGO_VAULT_KEY must encode exactly 32 bytes.");
  }
  return key;
}

export class LocalCredentialVault implements CredentialVault {
  readonly #directory: string;
  #key: Buffer | undefined;

  constructor(stateDirectory = defaultGatewayStateDirectory()) {
    this.#directory = join(stateDirectory, "credentials");
  }

  async #masterKey(): Promise<Buffer> {
    if (this.#key) {
      return this.#key;
    }
    if (process.env.PORTEGO_VAULT_KEY) {
      this.#key = decodeEnvironmentKey(process.env.PORTEGO_VAULT_KEY);
      return this.#key;
    }

    const keyPath = join(this.#directory, "master.key");
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    try {
      this.#key = await readFile(keyPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      this.#key = randomBytes(32);
      await writeFile(keyPath, this.#key, { flag: "wx", mode: 0o600 });
    }
    if (this.#key.length !== 32) {
      throw new Error("The local Portego credential key has an invalid length.");
    }
    await chmod(keyPath, 0o600);
    return this.#key;
  }

  async #document(): Promise<EncryptedVaultDocument> {
    const value = await readJson(join(this.#directory, "vault.json"));
    if (value === undefined) {
      return { version: 1, values: {} };
    }
    const document = value as EncryptedVaultDocument;
    if (document.version !== 1 || typeof document.values !== "object") {
      throw new Error("The local Portego credential vault is not recognized.");
    }
    return document;
  }

  async put(reference: string, value: Record<string, unknown>): Promise<void> {
    const key = await this.#masterKey();
    const document = await this.#document();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    document.values[reference] = {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    await atomicJsonWrite(join(this.#directory, "vault.json"), document);
  }

  async get(reference: string): Promise<Record<string, unknown> | undefined> {
    const encrypted = (await this.#document()).values[reference];
    if (!encrypted) {
      return undefined;
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await this.#masterKey(),
      Buffer.from(encrypted.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as Record<string, unknown>;
  }

  async remove(reference: string): Promise<void> {
    const document = await this.#document();
    delete document.values[reference];
    await atomicJsonWrite(join(this.#directory, "vault.json"), document);
  }
}
