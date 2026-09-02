from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

from .schemas import HomeDocument

STATE_KEYS = {"on", "brightness", "temperature", "contact", "occupancy", "energy"}
CAPABILITY_MAP = {
    "on_off": "power",
    "brightness": "brightness",
    "color_temperature": "color_temperature",
    "temperature": "temperature",
    "contact": "contact",
    "occupancy": "occupancy",
    "energy": "energy",
}


def timestamp() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def empty_home(name: str = "Casa Portego") -> dict:
    now = timestamp()
    return {
        "id": f"home_{uuid4()}",
        "name": name,
        "description": "",
        "homeType": "",
        "notes": "",
        "revision": 0,
        "floors": [
            {
                "id": f"floor_{uuid4()}",
                "name": "Ground floor",
                "description": "",
                "notes": "",
            }
        ],
        "rooms": [],
        "devices": [],
        "endpoints": [],
        "bindings": [],
        "openings": [],
        "gateway": {
            "id": "gateway_unpaired",
            "label": "No gateway paired",
            "status": "offline",
            "lastSeenAt": None,
            "version": "",
        },
        "updatedAt": now,
    }


def import_home(raw_home: HomeDocument) -> dict:
    document = deepcopy(raw_home.model_dump(mode="json", exclude_none=True))
    document["id"] = f"home_{uuid4()}"
    document["revision"] = 0
    document["endpoints"] = []
    document["bindings"] = []
    document["gateway"] = {
        "id": "gateway_unpaired",
        "label": "No gateway paired",
        "status": "offline",
        "lastSeenAt": None,
        "version": "",
    }
    document["updatedAt"] = timestamp()
    validated = HomeDocument.model_validate(document).model_dump(mode="json", exclude_none=True)
    validated["gateway"]["lastSeenAt"] = None
    return validated


def merge_canvas_update(current: dict, incoming: HomeDocument) -> dict:
    document = incoming.model_dump(mode="json", exclude_none=True)
    document["id"] = current["id"]
    document["endpoints"] = current.get("endpoints", [])
    document["gateway"] = current.get("gateway", document["gateway"])
    valid_endpoint_ids = {endpoint["id"] for endpoint in document["endpoints"]}
    document["bindings"] = [
        binding for binding in document["bindings"] if binding["endpointId"] in valid_endpoint_ids
    ]
    document["updatedAt"] = timestamp()
    validated = HomeDocument.model_validate(document).model_dump(mode="json", exclude_none=True)
    validated["gateway"].setdefault("lastSeenAt", None)
    return validated


def _gateway_state(raw: object) -> dict:
    if not isinstance(raw, dict):
        return {}
    return {key: value for key, value in raw.items() if key in STATE_KEYS}


def merge_gateway_endpoints(document: dict, gateway_id: str, raw_endpoints: object) -> dict:
    """Replace one gateway's inventory and map protocol capabilities into HomeDocument."""
    endpoints = raw_endpoints if isinstance(raw_endpoints, list) else []
    previous = {item["id"]: item for item in document.get("endpoints", [])}
    normalized: list[dict] = []
    for raw in endpoints:
        if not isinstance(raw, dict) or not isinstance(raw.get("id"), str):
            continue
        capabilities = list(
            dict.fromkeys(
                CAPABILITY_MAP[item]
                for item in raw.get("capabilities", [])
                if item in CAPABILITY_MAP
            )
        )
        if not capabilities:
            continue
        old = previous.get(raw["id"], {})
        normalized.append(
            {
                "id": raw["id"],
                "gatewayId": gateway_id,
                "label": str(raw.get("label") or "Unnamed endpoint")[:120],
                "protocol": str(raw.get("protocol") or "unknown"),
                "reachable": bool(raw.get("reachable", True)),
                "capabilities": capabilities,
                "desiredState": _gateway_state(old.get("desiredState")),
                "reportedState": _gateway_state(raw.get("reportedState")),
                "updatedAt": raw.get("updatedAt") or timestamp(),
            }
        )

    retained = [
        endpoint
        for endpoint in document.get("endpoints", [])
        if endpoint.get("gatewayId") != gateway_id
    ]
    next_document = deepcopy(document)
    next_document["endpoints"] = retained + normalized
    endpoint_ids = {endpoint["id"] for endpoint in next_document["endpoints"]}
    next_document["bindings"] = [
        binding
        for binding in next_document.get("bindings", [])
        if binding.get("endpointId") in endpoint_ids
    ]
    next_document["revision"] = int(next_document.get("revision", 0)) + 1
    next_document["updatedAt"] = timestamp()
    return HomeDocument.model_validate(next_document).model_dump(mode="json", exclude_none=True)


def apply_gateway_state(
    document: dict,
    endpoint_id: str,
    reported_state: object,
    desired_state: object | None = None,
) -> dict:
    next_document = deepcopy(document)
    found = False
    for endpoint in next_document.get("endpoints", []):
        if endpoint.get("id") != endpoint_id:
            continue
        found = True
        endpoint["reachable"] = True
        endpoint["reportedState"] = {
            **_gateway_state(endpoint.get("reportedState")),
            **_gateway_state(reported_state),
        }
        if desired_state is not None:
            endpoint["desiredState"] = {
                **_gateway_state(endpoint.get("desiredState")),
                **_gateway_state(desired_state),
            }
        endpoint["updatedAt"] = timestamp()
        break
    if not found:
        raise ValueError("Device endpoint not found.")
    next_document["revision"] = int(next_document.get("revision", 0)) + 1
    next_document["updatedAt"] = timestamp()
    return HomeDocument.model_validate(next_document).model_dump(mode="json", exclude_none=True)
