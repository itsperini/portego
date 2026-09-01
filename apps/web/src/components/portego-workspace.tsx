"use client";

import { endpointForFixture, type Fixture, roomForFixture } from "@portego/home-model";
import {
  Bot,
  ChevronRight,
  CircleDot,
  House,
  Layers3,
  Lightbulb,
  Plus,
  Radio,
  RefreshCcw,
  ScanLine,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { usePortegoHome } from "../hooks/use-portego-home";
import { useWebMcp } from "../hooks/use-webmcp";
import { HomeCanvas } from "./home-canvas";

export function PortegoWorkspace() {
  const {
    home,
    connectionMode,
    error,
    getHome,
    addRoom,
    addFixture,
    setFixtureState,
    discover,
    reset,
  } = usePortegoHome();
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>();
  const [activity, setActivity] = useState("The home model is ready for a first instruction.");
  const [busy, setBusy] = useState(false);

  const webMcpActions = useMemo(
    () => ({ getHome, addRoom, addFixture, setFixtureState, reset }),
    [getHome, addRoom, addFixture, setFixtureState, reset],
  );
  const onAgentActivity = useCallback((message: string) => setActivity(message), []);
  const webMcpStatus = useWebMcp(webMcpActions, onAgentActivity);

  const selectedFixture = home.fixtures.find((fixture) => fixture.id === selectedFixtureId);
  const selectedEndpoint = selectedFixture
    ? endpointForFixture(home, selectedFixture.id)
    : undefined;

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }, []);

  const buildDemo = useCallback(
    () =>
      run(async () => {
        await reset();
        const withRoom = await addRoom({
          label: "Kitchen",
          x: 210,
          y: 132,
          width: 520,
          height: 340,
        });
        const room = withRoom.rooms.at(-1);
        if (!room) {
          return;
        }
        const complete = await addFixture({
          roomId: room.id,
          label: "Kitchen ceiling",
          type: "light",
          autoBind: true,
        });
        setSelectedFixtureId(complete.fixtures.at(-1)?.id);
        setActivity("Kitchen ceiling is bound to Simulator light 01.");
      }),
    [addFixture, addRoom, reset, run],
  );

  const addNextRoom = useCallback(
    () =>
      run(async () => {
        const label = home.rooms.length === 0 ? "Kitchen" : `Living room ${home.rooms.length}`;
        const next = await addRoom({ label });
        setActivity(`${label} was added to the home.`);
        if (next.rooms.length === 1) {
          setSelectedFixtureId(undefined);
        }
      }),
    [addRoom, home.rooms.length, run],
  );

  const addLight = useCallback(
    () =>
      run(async () => {
        let current = getHome();
        if (current.rooms.length === 0) {
          current = await addRoom({ label: "Kitchen" });
        }
        const room = current.rooms[0];
        if (!room) {
          return;
        }
        const label =
          room.label +
          (current.fixtures.length === 0 ? " ceiling" : ` light ${current.fixtures.length + 1}`);
        const next = await addFixture({
          roomId: room.id,
          label,
          type: "light",
          autoBind: true,
        });
        setSelectedFixtureId(next.fixtures.at(-1)?.id);
        setActivity(`${label} was added${next.bindings.length > 0 ? " and bound." : "."}`);
      }),
    [addFixture, addRoom, getHome, run],
  );

  const toggleFixture = useCallback(
    (fixture: Fixture) =>
      run(async () => {
        const endpoint = endpointForFixture(getHome(), fixture.id);
        if (!endpoint) {
          setActivity(`${fixture.label} needs a device binding before it can be controlled.`);
          return;
        }
        const next = await setFixtureState({
          fixtureId: fixture.id,
          on: !endpoint.reportedState.on,
        });
        const reported = endpointForFixture(next, fixture.id)?.reportedState;
        setActivity(`${fixture.label} confirmed ${reported?.on ? "on." : "off."}`);
      }),
    [getHome, run, setFixtureState],
  );

  const toolStatusCopy = {
    ready: "Site tools ready",
    registering: "Registering tools",
    unavailable: "Open in Codex for tools",
    error: "Tools need attention",
  }[webMcpStatus];

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Portego home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="brand-name">portego</span>
          <span className="build-tag">walking skeleton</span>
        </a>

        <div className="home-crumb">
          <House size={15} aria-hidden="true" />
          <span>{home.name}</span>
          <ChevronRight size={13} aria-hidden="true" />
          <strong>Ground floor</strong>
        </div>

        <div className="topbar-status">
          <span className={`status-chip tools-${webMcpStatus}`}>
            <Sparkles size={14} aria-hidden="true" />
            {toolStatusCopy}
          </span>
          <span className={`status-chip connection-${connectionMode}`}>
            {connectionMode === "cloud" ? (
              <Wifi size={14} aria-hidden="true" />
            ) : (
              <WifiOff size={14} aria-hidden="true" />
            )}
            {connectionMode === "cloud" ? "Render path" : "Local demo"}
          </span>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="left-rail">
          <section className="rail-section">
            <div className="section-heading">
              <span>Home structure</span>
              <strong>{home.rooms.length + home.fixtures.length}</strong>
            </div>
            <nav className="structure-tree" aria-label="Home structure">
              <div className="tree-root">
                <Layers3 size={15} aria-hidden="true" />
                <span>Ground floor</span>
              </div>
              {home.rooms.length === 0 ? (
                <p className="tree-empty">No rooms yet. The canvas is waiting for a description.</p>
              ) : (
                home.rooms.map((room) => {
                  const fixtures = home.fixtures.filter((fixture) => fixture.roomId === room.id);
                  return (
                    <div className="tree-room" key={room.id}>
                      <div className="tree-room-label">
                        <span className="room-swatch" />
                        <span>{room.label}</span>
                        <small>{fixtures.length}</small>
                      </div>
                      {fixtures.map((fixture) => {
                        const endpoint = endpointForFixture(home, fixture.id);
                        return (
                          <button
                            className={
                              "tree-fixture " +
                              (selectedFixtureId === fixture.id ? "is-selected" : "")
                            }
                            type="button"
                            key={fixture.id}
                            onClick={() => setSelectedFixtureId(fixture.id)}
                          >
                            <Lightbulb size={14} aria-hidden="true" />
                            <span>{fixture.label}</span>
                            <i className={endpoint?.reportedState.on ? "is-on" : ""} />
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </nav>
          </section>

          <section className="rail-section quick-actions">
            <div className="section-heading">
              <span>Direct actions</span>
            </div>
            <button type="button" onClick={addNextRoom} disabled={busy}>
              <Plus size={15} />
              Add a room
            </button>
            <button type="button" onClick={addLight} disabled={busy}>
              <Lightbulb size={15} />
              Add a light
            </button>
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  await discover();
                  setActivity("The gateway reported one simulated light.");
                })
              }
              disabled={busy}
            >
              <ScanLine size={15} />
              Discover devices
            </button>
          </section>

          <section className="rail-section model-legend">
            <div className="section-heading">
              <span>Model key</span>
            </div>
            <div>
              <i className="legend-fixture" />
              <span>Designed fixture</span>
            </div>
            <div>
              <i className="legend-binding" />
              <span>Physical binding</span>
            </div>
          </section>

          <button
            className="reset-button"
            type="button"
            onClick={() =>
              void run(async () => {
                await reset();
                setSelectedFixtureId(undefined);
                setActivity("The demo home was reset.");
              })
            }
            disabled={busy}
          >
            <RefreshCcw size={14} />
            Reset demo
          </button>
        </aside>

        <HomeCanvas
          home={home}
          selectedFixtureId={selectedFixtureId}
          onSelectFixture={(fixture) => setSelectedFixtureId(fixture.id)}
          onToggleFixture={(fixture) => void toggleFixture(fixture)}
          onBuildDemo={() => void buildDemo()}
        />

        <aside className="right-rail">
          <section className="gateway-card">
            <div className="gateway-visual" aria-hidden="true">
              <Radio size={22} />
              <span className={`gateway-pulse gateway-${home.gateway.status}`} />
            </div>
            <div>
              <span className="eyebrow">Home gateway</span>
              <strong>{home.gateway.label}</strong>
              <p>
                {connectionMode === "local"
                  ? "Browser-local simulator"
                  : home.gateway.status === "online"
                    ? "Connected over outbound WebSocket"
                    : "Waiting for the agent"}
              </p>
            </div>
            <span className={`gateway-state state-${home.gateway.status}`}>
              <CircleDot size={12} />
              {connectionMode === "local" ? "demo" : home.gateway.status}
            </span>
          </section>

          <section className="conversation-card">
            <div className="section-heading">
              <span>Try with Codex</span>
              <Bot size={15} />
            </div>
            <blockquote>
              “Create a kitchen, then add a ceiling light and turn it on at 40 percent.”
            </blockquote>
            <p>
              Codex can call the site tools while this page is open, and every change remains
              visible here.
            </p>
          </section>

          <section className="inspector-card">
            <div className="section-heading">
              <span>Inspector</span>
              {selectedFixture ? <small>fixture</small> : <small>nothing selected</small>}
            </div>
            {selectedFixture ? (
              <>
                <div className="fixture-identity">
                  <div
                    className={
                      selectedEndpoint?.reportedState.on ? "identity-icon is-on" : "identity-icon"
                    }
                  >
                    <Lightbulb size={21} />
                  </div>
                  <div>
                    <strong>{selectedFixture.label}</strong>
                    <span>{roomForFixture(home, selectedFixture)?.label}</span>
                  </div>
                </div>
                <dl className="fixture-facts">
                  <div>
                    <dt>Binding</dt>
                    <dd>{selectedEndpoint?.label ?? "Unbound"}</dd>
                  </div>
                  <div>
                    <dt>Reported</dt>
                    <dd>{selectedEndpoint?.reportedState.on ? "On" : "Off"}</dd>
                  </div>
                  <div>
                    <dt>Brightness</dt>
                    <dd>{selectedEndpoint?.reportedState.brightness ?? "—"}%</dd>
                  </div>
                </dl>
                <button
                  className={
                    selectedEndpoint?.reportedState.on ? "fixture-control is-on" : "fixture-control"
                  }
                  type="button"
                  disabled={!selectedEndpoint || busy}
                  onClick={() => void toggleFixture(selectedFixture)}
                >
                  <Lightbulb size={17} />
                  Turn {selectedEndpoint?.reportedState.on ? "off" : "on"}
                </button>
              </>
            ) : (
              <div className="inspector-empty">
                <Lightbulb size={20} />
                <p>Select a fixture on the canvas to inspect its binding and reported state.</p>
              </div>
            )}
          </section>

          <section className="activity-card" aria-live="polite">
            <div className="activity-marker">
              <span />
            </div>
            <div>
              <span className="eyebrow">Latest model event</span>
              <p>{error ?? activity}</p>
            </div>
          </section>
        </aside>
      </div>

      <footer className="workspace-footer">
        <span>Portego model v0.1</span>
        <span>
          <i /> Fixture
          <i className="footer-dot-bound" /> Bound endpoint
        </span>
        <span>{busy ? "Applying change…" : "All visible changes are inspectable"}</span>
      </footer>
    </main>
  );
}
