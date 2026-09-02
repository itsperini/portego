from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient

from portego_api.config import Settings
from portego_api.homes import empty_home
from portego_api.main import create_app
from portego_api.models import User
from portego_api.security import password_hash

PASSWORD = "private-beta-password"


def make_settings(database_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite+aiosqlite:///{database_path}",
        web_origins=["http://localhost:3100"],
        web_url="http://localhost:3100",
        gateway_jwt_secret="test-gateway-secret-with-32-characters",
        auto_create_tables=True,
    )


async def seed_user(app: object, email: str) -> None:
    async with app.state.session_factory() as session:
        session.add(
            User(
                email=email,
                display_name="Marco",
                password_hash=password_hash.hash(PASSWORD),
            )
        )
        await session.commit()


def login(client: TestClient, email: str) -> str:
    response = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200
    return response.json()["csrfToken"]


def test_private_beta_login_home_and_profile(tmp_path: Path) -> None:
    app = create_app(make_settings(tmp_path / "portego.db"))
    with TestClient(app) as client:
        client.portal.call(seed_user, app, "marco@example.com")
        assert client.get("/api/auth/session").json()["authenticated"] is False
        assert (
            client.post(
                "/api/auth/login",
                json={"email": "marco@example.com", "password": "wrong-password"},
            ).status_code
            == 401
        )

        csrf = login(client, "marco@example.com")
        session = client.get("/api/auth/session").json()
        assert session["authenticated"] is True
        assert session["hasHome"] is False
        assert "portego_session" in client.cookies

        created = client.post("/api/home", headers={"X-Portego-CSRF": csrf})
        assert created.status_code == 201
        home = created.json()
        assert home["rooms"] == []
        assert home["gateway"]["id"] == "gateway_unpaired"

        next_home = {**home, "name": "Casa Perini", "revision": 1}
        saved = client.put(
            "/api/home",
            headers={"X-Portego-CSRF": csrf},
            json={"baseRevision": 0, "home": next_home},
        )
        assert saved.status_code == 200
        assert saved.json()["name"] == "Casa Perini"

        stale = client.put(
            "/api/home",
            headers={"X-Portego-CSRF": csrf},
            json={"baseRevision": 0, "home": next_home},
        )
        assert stale.status_code == 409

        profile = client.patch(
            "/api/auth/me",
            headers={"X-Portego-CSRF": csrf},
            json={"displayName": "Marco Perini"},
        )
        assert profile.status_code == 200
        assert profile.json()["user"]["displayName"] == "Marco Perini"

        assert client.post("/api/auth/logout", headers={"X-Portego-CSRF": csrf}).status_code == 204
        assert client.get("/api/home").status_code == 401


def test_cached_home_import_removes_local_hardware(tmp_path: Path) -> None:
    app = create_app(make_settings(tmp_path / "portego-import.db"))
    with TestClient(app) as client:
        client.portal.call(seed_user, app, "import@example.com")
        csrf = login(client, "import@example.com")
        cached = empty_home("Cached house")
        cached["endpoints"] = [
            {
                "id": "endpoint_local",
                "gatewayId": "gateway_local",
                "label": "Local endpoint",
                "protocol": "simulated",
                "reachable": True,
                "capabilities": ["power"],
                "desiredState": {"on": False},
                "reportedState": {"on": False},
                "updatedAt": cached["updatedAt"],
            }
        ]
        imported = client.post("/api/home/import", headers={"X-Portego-CSRF": csrf}, json=cached)
        assert imported.status_code == 201
        assert imported.json()["name"] == "Cached house"
        assert imported.json()["endpoints"] == []
        assert imported.json()["gateway"]["id"] == "gateway_unpaired"


def test_gateway_claim_machine_token_and_websocket(tmp_path: Path) -> None:
    app = create_app(make_settings(tmp_path / "portego-gateway.db"))
    with TestClient(app) as client:
        client.portal.call(seed_user, app, "gateway@example.com")
        csrf = login(client, "gateway@example.com")
        assert client.post("/api/home", headers={"X-Portego-CSRF": csrf}).status_code == 201

        claim = client.post(
            "/api/gateway/claim/start",
            json={"gatewayName": "Home Raspberry Pi", "agentVersion": "0.2.0"},
        )
        assert claim.status_code == 201
        codes = claim.json()
        pending = client.post("/api/gateway/claim/poll", json={"deviceCode": codes["deviceCode"]})
        assert pending.json() == {"status": "pending"}

        approved = client.post(
            "/api/gateways/claim/approve",
            headers={"X-Portego-CSRF": csrf},
            json={"userCode": codes["userCode"]},
        )
        assert approved.status_code == 200

        credential = client.post(
            "/api/gateway/claim/poll", json={"deviceCode": codes["deviceCode"]}
        ).json()
        assert credential["status"] == "approved"
        assert "gatewayToken" in credential
        assert credential["websocketUrl"] == "ws://testserver/gateway/ws"

        behind_tls = client.post(
            "/api/gateway/claim/start",
            json={"gatewayName": "TLS Raspberry Pi", "agentVersion": "0.2.0"},
            headers={"X-Forwarded-Proto": "https"},
        )
        assert behind_tls.status_code == 201
        tls_codes = behind_tls.json()
        assert (
            client.post(
                "/api/gateways/claim/approve",
                headers={"X-Portego-CSRF": csrf},
                json={"userCode": tls_codes["userCode"]},
            ).status_code
            == 200
        )
        tls_credential = client.post(
            "/api/gateway/claim/poll",
            json={"deviceCode": tls_codes["deviceCode"]},
            headers={"X-Forwarded-Proto": "https"},
        ).json()
        assert tls_credential["websocketUrl"] == "wss://testserver/gateway/ws"

        with client.websocket_connect(
            "/gateway/ws", headers={"Authorization": f"Bearer {credential['gatewayToken']}"}
        ) as websocket:
            websocket.send_json(
                {
                    "protocolVersion": "0.1",
                    "messageId": "hello-1",
                    "gatewayId": credential["gatewayId"],
                    "sentAt": "2026-09-02T09:00:00Z",
                    "type": "gateway.hello",
                    "agentVersion": "0.2.0",
                    "endpoints": [
                        {
                            "id": "endpoint_shelly_light",
                            "deviceId": "device_shelly",
                            "nativeId": "light:0",
                            "label": "Shelly ceiling",
                            "type": "light",
                            "protocol": "shelly-rpc",
                            "reachable": True,
                            "capabilities": ["on_off", "brightness", "power"],
                            "readable": True,
                            "controllable": True,
                            "reportedState": {"on": False, "brightness": 35, "power": 0},
                            "metadata": {},
                            "updatedAt": "2026-09-02T09:00:00Z",
                        }
                    ],
                }
            )
            websocket.send_json({"type": "gateway.heartbeat"})
            assert websocket.receive_json()["type"] == "cloud.heartbeat.ack"
            gateways = client.get("/api/gateways").json()["gateways"]
            assert gateways[0]["status"] == "online"
            persisted = client.get("/api/home").json()
            assert persisted["endpoints"][0]["capabilities"] == ["power", "brightness"]
            assert persisted["endpoints"][0]["reportedState"] == {
                "on": False,
                "brightness": 35,
            }

            floor = persisted["floors"][0]
            persisted["rooms"] = [
                {
                    "id": "room_living",
                    "label": "Living room",
                    "floor": floor["name"],
                    "x": 80,
                    "y": 80,
                    "width": 300,
                    "height": 240,
                }
            ]
            persisted["devices"] = [
                {
                    "id": "device_living_light",
                    "roomId": "room_living",
                    "label": "Living light",
                    "type": "light",
                    "config": {"mounting": "ceiling", "dimmable": True},
                    "position": {"x": 200, "y": 180},
                    "capabilities": ["power", "brightness"],
                }
            ]
            persisted["bindings"] = [
                {
                    "id": "binding_living_light",
                    "deviceId": "device_living_light",
                    "endpointId": "endpoint_shelly_light",
                    "createdAt": "2026-09-02T09:00:00Z",
                }
            ]
            base_revision = persisted["revision"]
            persisted["revision"] += 1
            assert (
                client.put(
                    "/api/home",
                    headers={"X-Portego-CSRF": csrf},
                    json={"baseRevision": base_revision, "home": persisted},
                ).status_code
                == 200
            )

            with ThreadPoolExecutor(max_workers=1) as executor:
                state_request = executor.submit(
                    client.post,
                    "/api/devices/device_living_light/state",
                    headers={"X-Portego-CSRF": csrf},
                    json={"on": True, "brightness": 60},
                )
                command = websocket.receive_json()
                assert command["type"] == "cloud.device.set_state"
                assert command["endpointId"] == "endpoint_shelly_light"
                websocket.send_json(
                    {
                        "type": "gateway.command.result",
                        "correlationId": command["messageId"],
                        "endpointId": "endpoint_shelly_light",
                        "ok": True,
                        "state": {"on": True, "brightness": 60},
                    }
                )
                controlled = state_request.result(timeout=3)
                assert controlled.status_code == 200
                endpoint = controlled.json()["endpoints"][0]
                assert endpoint["desiredState"] == {"on": True, "brightness": 60}
                assert endpoint["reportedState"] == {"on": True, "brightness": 60}

            with ThreadPoolExecutor(max_workers=1) as executor:
                discovery_request = executor.submit(
                    client.post,
                    f"/api/gateways/{credential['gatewayId']}/discover",
                    headers={"X-Portego-CSRF": csrf},
                    json={"methods": ["mdns"]},
                )
                command = websocket.receive_json()
                assert command["type"] == "cloud.discovery.start"
                assert command["methods"] == ["mdns"]
                websocket.send_json(
                    {
                        "type": "gateway.discovery.result",
                        "correlationId": command["messageId"],
                        "candidates": [
                            {
                                "id": "candidate_shelly",
                                "name": "Shelly kitchen",
                                "endpointCount": 1,
                                "setupStatus": "ready",
                                "warnings": [],
                            }
                        ],
                        "providers": [
                            {"providerId": "mdns", "status": "ok", "observationCount": 1}
                        ],
                    }
                )
                discovery = discovery_request.result(timeout=3)
                assert discovery.status_code == 200
                assert discovery.json()["candidates"][0]["name"] == "Shelly kitchen"

        gateways = client.get("/api/gateways").json()["gateways"]
        assert gateways[0]["status"] == "offline"
