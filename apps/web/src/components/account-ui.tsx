"use client";

import type { HomeDocument } from "@portego/home-model";
import {
  ArrowRight,
  Bluetooth,
  Check,
  ChevronDown,
  CircleUserRound,
  ExternalLink,
  HousePlus,
  KeyRound,
  LoaderCircle,
  LocateFixed,
  LogOut,
  Network,
  RadioTower,
  Router,
  Save,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { PortegoSession, PortegoUser } from "../hooks/use-portego-auth";
import { apiRequest } from "../lib/api";

type ModalShellProps = {
  children: React.ReactNode;
  label: string;
  onClose?: () => void;
  wide?: boolean;
};

function ModalShell({ children, label, onClose, wide = false }: ModalShellProps) {
  return (
    <div className="portal-overlay" role="presentation">
      <section
        className={`portal-card ${wide ? "portal-card-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {onClose ? (
          <button className="portal-close" type="button" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        ) : null}
        {children}
      </section>
    </div>
  );
}

export function LoginModal({
  onClose,
  onLogin,
}: {
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<PortegoSession>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await onLogin(email, password);
      onClose();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell label="Log in to Portego" onClose={onClose}>
      <div className="portal-kicker">
        <ShieldCheck size={14} />
        Private beta access
      </div>
      <div className="portal-heading">
        <span className="portal-heading-mark" aria-hidden="true" />
        <div>
          <h1>Return to your home</h1>
          <p>Sign in to save the spatial model and reach your local gateway.</p>
        </div>
      </div>
      <form className="portal-form" onSubmit={submit}>
        <label>
          <span>Email</span>
          <input
            autoComplete="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your private beta password"
            required
          />
        </label>
        {error ? <p className="portal-error">{error}</p> : null}
        <button className="portal-primary" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="is-spinning" size={16} /> : <KeyRound size={16} />}
          Log in
          {!busy ? <ArrowRight size={15} /> : null}
        </button>
        <a
          className="portal-access-link"
          href="https://x.com/itsperini"
          target="_blank"
          rel="noreferrer"
        >
          <span>
            <strong>Request private access</strong>
            <small>Send a DM to @itsperini on X</small>
          </span>
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      </form>
      <p className="portal-footnote">Private-beta accounts are approved individually.</p>
    </ModalShell>
  );
}

export function HomeImportModal({
  home,
  onImport,
  onStartEmpty,
}: {
  home: HomeDocument;
  onImport: () => Promise<void>;
  onStartEmpty: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"import" | "empty">();
  const [error, setError] = useState<string>();
  const hasDraft = home.floors.length > 0 || home.rooms.length > 0 || home.devices.length > 0;

  async function choose(action: "import" | "empty") {
    setBusy(action);
    setError(undefined);
    try {
      await (action === "import" ? onImport() : onStartEmpty());
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The home could not be saved.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <ModalShell label="Save this home to your account">
      <div className="portal-kicker">
        <HousePlus size={14} />
        First login
      </div>
      <div className="portal-heading">
        <span className="portal-heading-mark" aria-hidden="true" />
        <div>
          <h1>{hasDraft ? "Keep the home you started" : "Create your account home"}</h1>
          <p>
            {hasDraft
              ? "This browser has a local Portego draft. You can bind it to your account now."
              : "No local rooms were found. Start with a clean, account-backed canvas."}
          </p>
        </div>
      </div>
      {hasDraft ? (
        <div className="import-summary">
          <div>
            <strong>{home.name}</strong>
            <span>Local draft</span>
          </div>
          <dl>
            <div>
              <dt>Floors</dt>
              <dd>{home.floors.length}</dd>
            </div>
            <div>
              <dt>Rooms</dt>
              <dd>{home.rooms.length}</dd>
            </div>
            <div>
              <dt>Devices</dt>
              <dd>{home.devices.length}</dd>
            </div>
          </dl>
        </div>
      ) : null}
      {error ? <p className="portal-error">{error}</p> : null}
      <div className="portal-choice-actions">
        {hasDraft ? (
          <button
            className="portal-primary"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void choose("import")}
          >
            {busy === "import" ? (
              <LoaderCircle className="is-spinning" size={16} />
            ) : (
              <Save size={16} />
            )}
            Save this home
          </button>
        ) : null}
        <button
          className="portal-secondary"
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void choose("empty")}
        >
          {busy === "empty" ? <LoaderCircle className="is-spinning" size={16} /> : null}
          Start with an empty home
        </button>
      </div>
      <p className="portal-footnote">
        Local device bindings are not imported; the gateway will discover them again safely.
      </p>
    </ModalShell>
  );
}

export function ProfileModal({
  user,
  onClose,
  onSave,
  onLogout,
}: {
  user: PortegoUser;
  onClose: () => void;
  onSave: (input: {
    displayName?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<unknown>;
  onLogout: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await onSave({
        displayName,
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell label="User settings" onClose={onClose}>
      <div className="portal-kicker">
        <CircleUserRound size={14} />
        User settings
      </div>
      <div className="profile-identity">
        <span>{(user.displayName || user.email).slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{user.displayName || "Portego user"}</strong>
          <small>{user.email}</small>
        </div>
      </div>
      <form className="portal-form" onSubmit={submit}>
        <label>
          <span>Display name</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <div className="portal-divider">
          <span>Change password</span>
        </div>
        <label>
          <span>Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        {message ? (
          <p className="portal-success">
            <Check size={14} />
            {message}
          </p>
        ) : null}
        {error ? <p className="portal-error">{error}</p> : null}
        <button className="portal-primary" type="submit" disabled={busy || !displayName.trim()}>
          {busy ? <LoaderCircle className="is-spinning" size={16} /> : <Save size={16} />}
          Save settings
        </button>
      </form>
      <button className="portal-logout" type="button" onClick={() => void onLogout().then(onClose)}>
        <LogOut size={15} />
        Log out
      </button>
    </ModalShell>
  );
}

type Gateway = {
  id: string;
  name: string;
  status: "online" | "offline";
  agentVersion: string;
  lastSeenAt: string | null;
};

type DiscoveryMethod = {
  id: "mdns" | "ssdp" | "manual" | "ble" | "matter";
  label: string;
  description: string;
};

type GatewayResponse = { gateways: Gateway[]; methods: DiscoveryMethod[] };

type DiscoveryResponse = {
  completed: boolean;
  endpoints: Array<{ id: string }>;
  candidates: Array<{
    id: string;
    name: string;
    manufacturer?: string;
    model?: string;
    protocol?: string;
    driver?: string;
    confidence?: number;
    endpointCount: number;
    setupStatus: string;
    warnings: string[];
  }>;
  providers: Array<{
    providerId: string;
    status: "ok" | "unavailable" | "failed";
    observationCount: number;
    message?: string;
  }>;
};

const methodIcons = {
  mdns: Network,
  ssdp: RadioTower,
  manual: LocateFixed,
  ble: Bluetooth,
  matter: Sparkles,
};

export function GatewayModal({
  csrfToken,
  initialClaimCode,
  onInventoryChanged,
  onClose,
}: {
  csrfToken: string;
  initialClaimCode?: string;
  onInventoryChanged: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [data, setData] = useState<GatewayResponse>({ gateways: [], methods: [] });
  const [claimCode, setClaimCode] = useState(initialClaimCode ?? "");
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [discovery, setDiscovery] = useState<DiscoveryResponse>();

  const load = useCallback(async () => {
    try {
      setData(await apiRequest<GatewayResponse>("/api/gateways", { cache: "no-store" }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gateways could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
    const refreshTimer = window.setInterval(() => void load(), 4_000);
    return () => window.clearInterval(refreshTimer);
  }, [load]);

  const activeGateway = useMemo(
    () => data.gateways.find((gateway) => gateway.status === "online") ?? data.gateways[0],
    [data.gateways],
  );

  async function approve(event: FormEvent) {
    event.preventDefault();
    setBusy("claim");
    setError(undefined);
    setMessage(undefined);
    try {
      await apiRequest("/api/gateways/claim/approve", {
        method: "POST",
        csrfToken,
        body: JSON.stringify({ userCode: claimCode }),
      });
      setMessage("Gateway paired. It will appear online as soon as the agent connects.");
      setClaimCode("");
      await load();
    } catch (claimError) {
      setError(
        claimError instanceof Error ? claimError.message : "The gateway could not be paired.",
      );
    } finally {
      setBusy(undefined);
    }
  }

  async function discover(methods: DiscoveryMethod["id"][], busyKey: string) {
    if (!activeGateway) return;
    setBusy(busyKey);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await apiRequest<DiscoveryResponse>(
        `/api/gateways/${activeGateway.id}/discover`,
        {
          method: "POST",
          csrfToken,
          body: JSON.stringify({
            methods,
            ...(methods.includes("manual") && host ? { host } : {}),
          }),
        },
      );
      setDiscovery(result);
      await onInventoryChanged();
      setMessage(
        result.candidates.length > 0
          ? `Found ${result.candidates.length} candidate device${result.candidates.length === 1 ? "" : "s"}. ${result.endpoints.length} hardware endpoint${result.endpoints.length === 1 ? " is" : "s are"} now available in device settings.`
          : `Scan finished on ${activeGateway.name}; no device candidates were found.`,
      );
    } catch (discoverError) {
      setError(
        discoverError instanceof Error ? discoverError.message : "The discovery request failed.",
      );
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <ModalShell label="Gateway settings" onClose={onClose} wide>
      <div className="gateway-header">
        <div>
          <div className="portal-kicker">
            <Router size={14} />
            Local gateway
          </div>
          <h1>Bridge Portego to your home</h1>
          <p>
            The gateway discovers devices locally. Portego sends short-lived commands through its
            secure connection.
          </p>
        </div>
        <div
          className={`gateway-presence ${activeGateway?.status === "online" ? "is-online" : ""}`}
        >
          <i />
          {activeGateway ? `${activeGateway.name} · ${activeGateway.status}` : "No gateway paired"}
        </div>
      </div>

      <div className="gateway-layout">
        <section className="gateway-claim-panel">
          <span className="gateway-step">01 / Pair</span>
          <h2>Connect a gateway</h2>
          <p>
            Run <code>portego setup</code> on the Linux device in your home, then enter the code it
            shows.
          </p>
          <form className="claim-form" onSubmit={approve}>
            <input
              aria-label="Gateway claim code"
              value={claimCode}
              onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
              placeholder="ABCD-1234"
              maxLength={9}
              required
            />
            <button type="submit" disabled={busy === "claim" || !claimCode.trim()}>
              {busy === "claim" ? (
                <LoaderCircle className="is-spinning" size={15} />
              ) : (
                <ShieldCheck size={15} />
              )}
              Pair
            </button>
          </form>
          <div className="gateway-list">
            {data.gateways.map((gateway) => (
              <div key={gateway.id}>
                <i className={gateway.status === "online" ? "is-online" : ""} />
                <span>
                  <strong>{gateway.name}</strong>
                  <small>{gateway.agentVersion || "Version unknown"}</small>
                </span>
                <em>{gateway.status}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="gateway-method-panel">
          <span className="gateway-step">02 / Discover</span>
          <h2>Find devices</h2>
          <p>
            Search across every available discovery method. The scan runs inside your home network;
            Portego only receives normalized results.
          </p>
          <button
            className="autodiscovery-button"
            type="button"
            disabled={activeGateway?.status !== "online" || Boolean(busy)}
            onClick={() =>
              void discover(
                data.methods.filter((method) => method.id !== "manual").map((method) => method.id),
                "auto",
              )
            }
          >
            {busy === "auto" ? (
              <LoaderCircle className="is-spinning" size={20} />
            ) : (
              <ScanSearch size={20} />
            )}
            <span>
              <strong>Autodiscovery</strong>
              <small>Try every automatic method</small>
            </span>
            <ArrowRight size={16} />
          </button>
          <details className="manual-discovery">
            <summary>
              <span>
                <strong>Manual discovery</strong>
                <small>Choose one method or enter a known address</small>
              </span>
              <ChevronDown size={16} />
            </summary>
            <div className="manual-discovery-body">
              <div className="discovery-methods">
                {data.methods.map((method) => {
                  const Icon = methodIcons[method.id];
                  return (
                    <button
                      type="button"
                      key={method.id}
                      disabled={activeGateway?.status !== "online" || Boolean(busy)}
                      onClick={() => void discover([method.id], method.id)}
                    >
                      <Icon size={18} />
                      <span>
                        <strong>{method.label}</strong>
                        <small>{method.description}</small>
                      </span>
                      {busy === method.id ? (
                        <LoaderCircle className="is-spinning" size={15} />
                      ) : (
                        <ArrowRight size={15} />
                      )}
                    </button>
                  );
                })}
              </div>
              <label className="manual-host">
                <span>Optional local address for “Known address”</span>
                <input
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="192.168.1.42 or device.local"
                />
              </label>
            </div>
          </details>
          {discovery ? (
            <div className="discovery-results">
              <div className="discovery-results-heading">
                <strong>Latest result</strong>
                <span>{discovery.candidates.length} candidates</span>
              </div>
              {discovery.candidates.length > 0 ? (
                discovery.candidates.map((candidate) => (
                  <div className="discovery-candidate" key={candidate.id}>
                    <span>
                      <strong>{candidate.name}</strong>
                      <small>
                        {[candidate.manufacturer, candidate.model].filter(Boolean).join(" ") ||
                          candidate.protocol ||
                          "Unidentified local device"}
                        {candidate.endpointCount > 0
                          ? ` · ${candidate.endpointCount} endpoint${candidate.endpointCount === 1 ? "" : "s"}`
                          : ""}
                      </small>
                    </span>
                    <em>
                      {candidate.driver
                        ? `${Math.round((candidate.confidence ?? 0) * 100)}% match`
                        : candidate.setupStatus}
                    </em>
                  </div>
                ))
              ) : (
                <p className="discovery-empty">
                  The selected providers completed without a matching device.
                </p>
              )}
              <div className="provider-results">
                {discovery.providers.map((provider) => (
                  <span
                    key={provider.providerId}
                    className={provider.status === "ok" ? "is-ok" : ""}
                  >
                    {provider.providerId} · {provider.status} · {provider.observationCount}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
      {message ? (
        <p className="portal-success gateway-message">
          <Check size={14} />
          {message}
        </p>
      ) : null}
      {error ? <p className="portal-error gateway-message">{error}</p> : null}
    </ModalShell>
  );
}
