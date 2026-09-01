"use client";

import {
  type AddFixtureInput,
  type AddOpeningInput,
  type AddRoomInput,
  type ApplyHomeChangesInput,
  addFixture as addFixtureLocally,
  addOpening as addOpeningLocally,
  addRoom as addRoomLocally,
  applyHomeChanges as applyHomeChangesLocally,
  applyReportedState,
  type BindFixtureInput,
  bindFixtureToEndpoint as bindFixtureLocally,
  createDemoHome,
  type HomeDocument,
  type MoveFixtureInput,
  moveFixture as moveFixtureLocally,
  type RemoveFixtureInput,
  type RemoveOpeningInput,
  type RemoveRoomInput,
  removeFixture as removeFixtureLocally,
  removeOpening as removeOpeningLocally,
  removeRoom as removeRoomLocally,
  type SetFixtureStateInput,
  setDesiredFixtureState,
  type UnbindFixtureInput,
  type UpdateFixtureInput,
  type UpdateRoomInput,
  unbindFixture as unbindFixtureLocally,
  updateFixture as updateFixtureLocally,
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
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const homeRef = useRef(home);
  const localUndoRef = useRef<HomeDocument[]>([]);
  const localRedoRef = useRef<HomeDocument[]>([]);

  const updateHome = useCallback((next: HomeDocument) => {
    homeRef.current = next;
    setHome(next);
    return next;
  }, []);

  const acceptCloudMutation = useCallback(
    (next: HomeDocument) => {
      setHistory({ canUndo: true, canRedo: false });
      return updateHome(next);
    },
    [updateHome],
  );

  const acceptLocalMutation = useCallback(
    (next: HomeDocument) => {
      localUndoRef.current.push(structuredClone(homeRef.current));
      localRedoRef.current = [];
      setHistory({ canUndo: true, canRedo: false });
      return updateHome(next);
    },
    [updateHome],
  );

  const refresh = useCallback(async () => {
    try {
      const [next, nextHistory] = await Promise.all([
        request<HomeDocument>("/api/home", { cache: "no-store" }),
        request<{ canUndo: boolean; canRedo: boolean }>("/api/history", {
          cache: "no-store",
        }),
      ]);
      setConnectionMode("cloud");
      setError(null);
      setHistory(nextHistory);
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
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not add the room.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return acceptLocalMutation(addRoomLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
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
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not add the fixture.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return acceptLocalMutation(addFixtureLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
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
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not update the room.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return acceptLocalMutation(updateRoomLocally(homeRef.current, { ...input, roomId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
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
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not move the fixture.",
          );
          throw requestError;
        }
        setConnectionMode("local");
        return acceptLocalMutation(moveFixtureLocally(homeRef.current, { ...input, fixtureId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
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
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          setError(
            requestError instanceof Error ? requestError.message : "Could not control the fixture.",
          );
          throw requestError;
        }
        const desired = setDesiredFixtureState(homeRef.current, input);
        setConnectionMode("local");
        return acceptLocalMutation(
          applyReportedState(desired.home, desired.endpoint.id, desired.requestedState),
        );
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const removeRoom = useCallback(
    async (input: RemoveRoomInput) => {
      const roomId =
        input.roomId ??
        homeRef.current.rooms.find(
          (room) => room.label.toLowerCase() === input.roomLabel?.toLowerCase(),
        )?.id;
      if (!roomId) {
        throw new Error("Room not found.");
      }
      try {
        const next = await request<HomeDocument>(`/api/rooms/${encodeURIComponent(roomId)}`, {
          method: "DELETE",
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(removeRoomLocally(homeRef.current, { roomId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const updateFixture = useCallback(
    async (input: UpdateFixtureInput) => {
      const fixtureId =
        input.fixtureId ??
        homeRef.current.fixtures.find(
          (fixture) => fixture.label.toLowerCase() === input.fixtureLabel?.toLowerCase(),
        )?.id;
      if (!fixtureId) {
        throw new Error("Fixture not found.");
      }
      try {
        const next = await request<HomeDocument>(`/api/fixtures/${encodeURIComponent(fixtureId)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...input, fixtureId }),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(updateFixtureLocally(homeRef.current, { ...input, fixtureId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const removeFixture = useCallback(
    async (input: RemoveFixtureInput) => {
      const fixtureId =
        input.fixtureId ??
        homeRef.current.fixtures.find(
          (fixture) => fixture.label.toLowerCase() === input.fixtureLabel?.toLowerCase(),
        )?.id;
      if (!fixtureId) {
        throw new Error("Fixture not found.");
      }
      try {
        const next = await request<HomeDocument>(`/api/fixtures/${encodeURIComponent(fixtureId)}`, {
          method: "DELETE",
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(removeFixtureLocally(homeRef.current, { fixtureId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const bindFixture = useCallback(
    async (input: BindFixtureInput) => {
      try {
        const next = await request<HomeDocument>("/api/bindings", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(bindFixtureLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const unbindFixture = useCallback(
    async (input: UnbindFixtureInput) => {
      const fixtureId =
        input.fixtureId ??
        homeRef.current.fixtures.find(
          (fixture) => fixture.label.toLowerCase() === input.fixtureLabel?.toLowerCase(),
        )?.id;
      if (!fixtureId) {
        throw new Error("Fixture not found.");
      }
      try {
        const next = await request<HomeDocument>(`/api/bindings/${encodeURIComponent(fixtureId)}`, {
          method: "DELETE",
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(unbindFixtureLocally(homeRef.current, { fixtureId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const addOpening = useCallback(
    async (input: AddOpeningInput) => {
      try {
        const next = await request<HomeDocument>("/api/openings", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(addOpeningLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const removeOpening = useCallback(
    async (input: RemoveOpeningInput) => {
      const openingId =
        input.openingId ??
        homeRef.current.openings.find(
          (opening) => opening.label?.toLowerCase() === input.label?.toLowerCase(),
        )?.id;
      if (!openingId) {
        throw new Error("Opening not found.");
      }
      try {
        const next = await request<HomeDocument>(`/api/openings/${encodeURIComponent(openingId)}`, {
          method: "DELETE",
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(removeOpeningLocally(homeRef.current, { openingId }));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const applyChanges = useCallback(
    async (input: ApplyHomeChangesInput) => {
      try {
        const next = await request<HomeDocument>("/api/changes", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setConnectionMode("cloud");
        setError(null);
        return acceptCloudMutation(next);
      } catch (requestError) {
        if (connectionMode === "cloud") {
          throw requestError;
        }
        return acceptLocalMutation(applyHomeChangesLocally(homeRef.current, input));
      }
    },
    [acceptCloudMutation, acceptLocalMutation, connectionMode],
  );

  const syncHistory = useCallback(async () => {
    if (connectionMode !== "cloud") {
      return;
    }
    const next = await request<{ canUndo: boolean; canRedo: boolean }>("/api/history");
    setHistory(next);
  }, [connectionMode]);

  const undo = useCallback(async () => {
    if (connectionMode === "cloud") {
      const next = await request<HomeDocument>("/api/history/undo", { method: "POST" });
      updateHome(next);
      await syncHistory();
      return next;
    }
    const previous = localUndoRef.current.pop();
    if (!previous) {
      throw new Error("There is nothing to undo.");
    }
    localRedoRef.current.push(structuredClone(homeRef.current));
    const next = updateHome(previous);
    setHistory({ canUndo: localUndoRef.current.length > 0, canRedo: true });
    return next;
  }, [connectionMode, syncHistory, updateHome]);

  const redo = useCallback(async () => {
    if (connectionMode === "cloud") {
      const next = await request<HomeDocument>("/api/history/redo", { method: "POST" });
      updateHome(next);
      await syncHistory();
      return next;
    }
    const following = localRedoRef.current.pop();
    if (!following) {
      throw new Error("There is nothing to redo.");
    }
    localUndoRef.current.push(structuredClone(homeRef.current));
    const next = updateHome(following);
    setHistory({ canUndo: true, canRedo: localRedoRef.current.length > 0 });
    return next;
  }, [connectionMode, syncHistory, updateHome]);

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
      setHistory({ canUndo: false, canRedo: false });
      localUndoRef.current = [];
      localRedoRef.current = [];
      return updateHome(next);
    } catch {
      setConnectionMode("local");
      setHistory({ canUndo: false, canRedo: false });
      localUndoRef.current = [];
      localRedoRef.current = [];
      return updateHome(createDemoHome(homeRef.current.name));
    }
  }, [updateHome]);

  return {
    home,
    connectionMode,
    error,
    history,
    getHome: () => homeRef.current,
    addRoom,
    addFixture,
    updateRoom,
    removeRoom,
    moveFixture,
    updateFixture,
    removeFixture,
    bindFixture,
    unbindFixture,
    addOpening,
    removeOpening,
    applyChanges,
    undo,
    redo,
    setFixtureState,
    discover,
    reset,
  };
}
