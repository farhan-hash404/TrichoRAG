"""Guards that matter once the API is public."""
from __future__ import annotations

import pytest

from app.core.config import DEV_SECRET, Settings
from tests.conftest import authenticate


def test_production_refuses_the_published_dev_secret():
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        Settings(trichorag_env="prod", secret_key=DEV_SECRET).check_production_safety()
    with pytest.raises(RuntimeError):
        Settings(trichorag_env="prod", secret_key="too-short").check_production_safety()
    Settings(trichorag_env="prod", secret_key="x" * 48).check_production_safety()  # fine
    Settings(trichorag_env="dev", secret_key=DEV_SECRET).check_production_safety()  # dev is fine


def test_shared_demo_account_cannot_be_deleted(client, monkeypatch):
    from app.api.routers import account

    monkeypatch.setattr(account.settings, "demo_mode", True)
    monkeypatch.setattr(account.settings, "demo_email", "demo-guard@example.com")

    demo = authenticate(client, "demo-guard@example.com")
    r = client.delete("/api/v1/account", headers=demo)
    assert r.status_code == 403 and "demo" in r.json()["detail"]
    assert client.get("/api/v1/auth/me", headers=demo).status_code == 200  # still there

    # Visitors' own accounts can still be deleted.
    own = authenticate(client, "visitor@example.com")
    assert client.delete("/api/v1/account", headers=own).json()["deleted"] is True
