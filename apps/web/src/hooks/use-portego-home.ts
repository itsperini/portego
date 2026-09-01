"use client";

import {
  type AddFixtureInput,
  type AddRoomInput,
  addFixture as addFixtureLocally,
  addRoom as addRoomLocally,
  applyReportedState,
  createDemoHome,
  type HomeDocument,
  type MoveFixtureInput,
  moveFixture as moveFixtureLocally,
  type SetFixtureStateInput,
  setDesiredFixtureState,
  type UpdateRoomInput,
  updateRoomGeometry as updateRoomLocally,
} from "@portego/home-model";
import { useCallback, useEffect, useRef, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_PORTEGO_API_URL ?? "http://localhost:4000";

type ConnectionMode = "connecting" | "cloud" | "local";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Portego request failed.");
  }
  return (await response.json()) as T;
}

export function usePortegoHome() {
  const [home, setHome] = useState<HomeDocument>(() => createDemoHome());
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("connecting");
  const [error, setError] = useState<string | null>(null);
  const homeRef = useRef(home);

  const updateHome = useCallback((next: HomeDocument) => {
    homeRef.current = next;
    setHome(next);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await request<HomeDocument>("/api/home", { cache: "no-store" });
      setConnectionMode("cloud");
      setError(null);
      return updateHome(next);
    } catch {
      setConnectionMode("local");
      return homeRef.current;
    }
  }, [updateHome]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (connectionMode !== "cloud") {
      return;
    }
    const poller = setInterval(() => void refresh(), 1_500);
    return () => clearInterval(poller);
  }, [connectionMode, refresh]);

  const addRoom = useCallback(
    async (input: AddRoomInput) => {
      try {
        const next = await request<HomeDocument>("/api/rooms", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return updateHome(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not add the room.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return updateHome(addRoomLocally(homeRef.current, input));
      }
    },
    [connectionMode, updateHome],
  );

  const addFixture = useCallback(
    async (input: AddFixtureInput) => {
      try {
        const next = await request<HomeDocument>("/api/fixtures", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return updateHome(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not add the fixture.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return updateHome(addFixtureLocally(homeRef.current, input));
      }
    },
    [connectionMode, updateHome],
  );

  const updateRoom = useCallback(
    async (input: UpdateRoomInput) => {
      const roomId =
        input.roomId ??
        homeRef.current.rooms.find(
          (room) => room.label.toLowerCase() === input.roomLabel?.toLowerCase(),
        )?.id;
      if (!roomId) {
        throw new Error("A room id is required for direct canvas editing.");
      }
      try {
        const next = await request<HomeDocument>(`/api/rooms/${encodeURIComponent(roomId)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...input, roomId }),
        });
        setConnectionMode("cloud");
        setError(null);
        return updateHome(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not update the room.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return updateHome(updateRoomLocally(homeRef.current, { ...input, roomId }));
      }
    },
    [connectionMode, updateHome],
  );

  const moveFixture = useCallback(
    async (input: MoveFixtureInput) => {
      const fixtureId =
        input.fixtureId ??
        homeRef.current.fixtures.find(
          (fixture) => fixture.label.toLowerCase() === input.fixtureLabel?.toLowerCase(),
        )?.id;
      if (!fixtureId) {
        throw new Error("A fixture id is required for direct canvas editing.");
      }
      try {
        const next = await request<HomeDocument>(`/api/fixtures/${encodeURIComponent(fixtureId)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...input, fixtureId }),
        });
        setConnectionMode("cloud");
        setError(null);
        return updateHome(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not move the fixture.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return updateHome(moveFixtureLocally(homeRef.current, { ...input, fixtureId }));
      }
    },
    [connectionMode, updateHome],
  );

  const setFixtureState = useCallback(
    async (input: SetFixtureStateInput) => {
      try {
        const next = await request<HomeDocument>("/api/devices/state", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return updateHome(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not control the fixture.",
          );
          throw requestError;
        }
        const desired = setDesiredFixtureState(homeRef.current, input);
        setConnectionMode("local");
        return updateHome(
          applyReportedState(desired.home, desired.endpoint.id, desired.requestedState),
        );
      }
    },
    [connectionMode, updateHome],
  );

  const discover = useCallback(async () => {
    if (connectionMode !== "cloud") {
      return homeRef.current;
    }
    const next = await request<HomeDocument>("/api/discovery", { method: "POST" });
    return updateHome(next);
  }, [connectionMode, updateHome]);

  const reset = useCallback(async () => {
    try {
      const next = await request<HomeDocument>("/api/reset", { method: "POST" });
      setConnectionMode("cloud");
      setError(null);
      return updateHome(next);
    } catch {
      setConnectionMode("local");
      return updateHome(createDemoHome(homeRef.current.name));
    }
  }, [updateHome]);

  return {
    home,
    connectionMode,
    error,
    getHome: () => homeRef.current,
    addRoom,
    addFixture,
    updateRoom,
    moveFixture,
    setFixtureState,
    discover,
    reset,
  };
}
