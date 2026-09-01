import { type MatterControllerBackend, MatterDriver } from "@portego/adapter-matter";
import { ShellyDriver } from "@portego/adapter-shelly";
import {
  type DiscoveryProvider,
  type GatewayDriver,
  GatewayRuntime,
  GatewayStateStore,
  LocalCredentialVault,
} from "@portego/gateway-core";
import {
  BluezBleDiscoveryProvider,
  ManualDiscoveryProvider,
  MdnsDiscoveryProvider,
  NetworkNeighborDiscoveryProvider,
  SsdpDiscoveryProvider,
} from "@portego/gateway-discovery";

export interface CreateGatewayRuntimeOptions {
  stateDirectory?: string;
  providers?: DiscoveryProvider[];
  drivers?: GatewayDriver[];
  matterController?: MatterControllerBackend;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
}

export function defaultDiscoveryProviders(): DiscoveryProvider[] {
  return [
    new MdnsDiscoveryProvider(),
    new SsdpDiscoveryProvider(),
    new ManualDiscoveryProvider(),
    new BluezBleDiscoveryProvider(),
    new NetworkNeighborDiscoveryProvider(),
  ];
}

export function defaultGatewayDrivers(matterController?: MatterControllerBackend): GatewayDriver[] {
  return [new ShellyDriver(), new MatterDriver(matterController)];
}

export function createGatewayRuntime(options: CreateGatewayRuntimeOptions = {}): GatewayRuntime {
  const store = new GatewayStateStore(options.stateDirectory);
  return new GatewayRuntime({
    providers: options.providers ?? defaultDiscoveryProviders(),
    drivers: options.drivers ?? defaultGatewayDrivers(options.matterController),
    store,
    vault: new LocalCredentialVault(store.stateDirectory),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}
