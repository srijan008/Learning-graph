"""
Test suite for the Learning Graph API.

Run with:
    pip install pytest pytest-asyncio httpx
    pytest tests/ -v

The tests use FastAPI's TestClient (sync) which works without a running server.
Neo4j is NOT mocked — tests run against the real Aura instance using .env creds.
Make sure the database has been seeded (python -m db.seed) before running.
"""

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


# ─── Health ──────────────────────────────────────────────────────────────────

class TestHealth:
    def test_root(self):
        """Root endpoint returns ok."""
        res = client.get("/")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

    def test_health(self):
        """Health endpoint returns healthy."""
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"


# ─── List Topics ─────────────────────────────────────────────────────────────

class TestListTopics:
    def test_returns_list(self):
        """GET /graph/topics should return a list."""
        res = client.get("/graph/topics")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    def test_minimum_topic_count(self):
        """Should have at least 29 seeded topics."""
        res = client.get("/graph/topics")
        assert len(res.json()) >= 29

    def test_topic_has_required_fields(self):
        """Each topic must have topic_id and name."""
        res = client.get("/graph/topics")
        for topic in res.json():
            assert "topic_id" in topic
            assert "name" in topic


# ─── Single Topic ─────────────────────────────────────────────────────────────

class TestGetTopic:
    def test_get_by_topic_id(self):
        """GET /graph/topic/lens returns Lenses node."""
        res = client.get("/graph/topic/lens")
        assert res.status_code == 200
        data = res.json()
        assert data["topic_id"] == "lens"
        assert data["name"] == "Lenses"

    def test_get_by_name(self):
        """Lookup by human name is case-insensitive."""
        res = client.get("/graph/topic/Lenses")
        assert res.status_code == 200
        assert res.json()["topic_id"] == "lens"

    def test_unknown_topic_returns_404(self):
        """Unknown topic_id returns HTTP 404."""
        res = client.get("/graph/topic/totally_unknown_xyz")
        assert res.status_code == 404

    def test_chapter_node(self):
        """Chapter-level node is returned correctly."""
        res = client.get("/graph/topic/phy_electricity")
        assert res.status_code == 200
        data = res.json()
        assert data["level"] == "chapter"
        assert data["subject"] == "Physics"


# ─── Neighbours — topic only ──────────────────────────────────────────────────

class TestNeighboursTopicOnly:
    def test_basic_response_structure(self):
        """Response must contain node, prerequisites, subtopics, parent, unlocks."""
        res = client.post("/graph/neighbours", json={"topic": "lens"})
        assert res.status_code == 200
        data = res.json()
        assert "node" in data
        assert "prerequisites" in data
        assert "subtopics" in data
        assert "parent" in data
        assert "unlocks" in data

    def test_lens_resolved_correctly(self):
        """'lens' resolves to the Lenses topic node."""
        res = client.post("/graph/neighbours", json={"topic": "lens"})
        assert res.status_code == 200
        assert res.json()["node"]["topic_id"] == "lens"
        assert res.json()["node"]["name"] == "Lenses"

    def test_lens_prerequisites(self):
        """lens REQUIRES snell_law."""
        res = client.post("/graph/neighbours", json={"topic": "lens"})
        prereq_ids = [p["topic_id"] for p in res.json()["prerequisites"]]
        assert "snell_law" in prereq_ids

    def test_lens_subtopics(self):
        """lens HAS_SUBTOPIC → lens_formula and magnification_lens."""
        res = client.post("/graph/neighbours", json={"topic": "lens"})
        sub_ids = [s["topic_id"] for s in res.json()["subtopics"]]
        assert "lens_formula" in sub_ids
        assert "magnification_lens" in sub_ids

    def test_lens_parent(self):
        """Parent of lens is phy_light_refraction."""
        res = client.post("/graph/neighbours", json={"topic": "lens"})
        parent = res.json()["parent"]
        assert parent is not None
        assert parent["topic_id"] == "phy_light_refraction"

    def test_lookup_by_human_name(self):
        """Accepts human name 'Lenses' same as topic_id 'lens'."""
        res = client.post("/graph/neighbours", json={"topic": "Lenses"})
        assert res.status_code == 200
        assert res.json()["node"]["topic_id"] == "lens"

    def test_chapter_node_has_subtopics(self):
        """Chapter-level node phy_electricity should have subtopics."""
        res = client.post("/graph/neighbours", json={"topic": "phy_electricity"})
        assert res.status_code == 200
        assert len(res.json()["subtopics"]) > 0

    def test_chapter_node_no_prerequisites(self):
        """phy_electricity (chapter) has no REQUIRES edges."""
        res = client.post("/graph/neighbours", json={"topic": "phy_electricity"})
        assert res.status_code == 200
        assert res.json()["prerequisites"] == []

    def test_chapter_node_no_parent(self):
        """Top-level chapter phy_electricity has no parent."""
        res = client.post("/graph/neighbours", json={"topic": "phy_electricity"})
        assert res.json()["parent"] is None

    def test_unknown_topic_returns_404(self):
        """Unknown topic returns HTTP 404 with detail message."""
        res = client.post("/graph/neighbours", json={"topic": "nonexistent_topic_abc"})
        assert res.status_code == 404
        assert "not found" in res.json()["detail"].lower()

    def test_missing_topic_field_returns_422(self):
        """Body without 'topic' field returns HTTP 422 Unprocessable Entity."""
        res = client.post("/graph/neighbours", json={"subtopic": "lens_formula"})
        assert res.status_code == 422

    def test_empty_body_returns_422(self):
        """Empty body returns HTTP 422."""
        res = client.post("/graph/neighbours", json={})
        assert res.status_code == 422


# ─── Neighbours — topic + subtopic ───────────────────────────────────────────

class TestNeighboursWithSubtopic:
    def test_resistance_under_electricity(self):
        """
        topic=phy_electricity + subtopic=resistance
        → resolves to the 'resistance' node.
        """
        res = client.post(
            "/graph/neighbours",
            json={"topic": "phy_electricity", "subtopic": "resistance"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["node"]["topic_id"] == "resistance"

    def test_resistance_prerequisites(self):
        """resistance REQUIRES electric_current."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "phy_electricity", "subtopic": "resistance"},
        )
        prereq_ids = [p["topic_id"] for p in res.json()["prerequisites"]]
        assert "electric_current" in prereq_ids

    def test_resistance_subtopics(self):
        """resistance HAS_SUBTOPIC → resistors_series and resistors_parallel."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "phy_electricity", "subtopic": "resistance"},
        )
        sub_ids = [s["topic_id"] for s in res.json()["subtopics"]]
        assert "resistors_series" in sub_ids
        assert "resistors_parallel" in sub_ids

    def test_resistance_parent(self):
        """Parent of resistance is ohms_law."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "phy_electricity", "subtopic": "resistance"},
        )
        assert res.json()["parent"]["topic_id"] == "ohms_law"

    def test_subtopic_by_human_name(self):
        """Subtopic can be looked up by human name."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "phy_electricity", "subtopic": "Resistance"},
        )
        assert res.status_code == 200
        assert res.json()["node"]["topic_id"] == "resistance"

    def test_unknown_subtopic_returns_404(self):
        """Valid topic + unknown subtopic → HTTP 404."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "phy_electricity", "subtopic": "totally_unknown_sub"},
        )
        assert res.status_code == 404

    def test_lens_formula_under_lens(self):
        """topic=lens + subtopic=lens_formula → resolves lens_formula node."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "lens", "subtopic": "lens_formula"},
        )
        assert res.status_code == 200
        assert res.json()["node"]["topic_id"] == "lens_formula"

    def test_spherical_mirror_subtopics(self):
        """spherical_mirror HAS_SUBTOPIC → mirror_formula and magnification_mirror."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "phy_light_reflection", "subtopic": "spherical_mirror"},
        )
        assert res.status_code == 200
        sub_ids = [s["topic_id"] for s in res.json()["subtopics"]]
        assert "mirror_formula" in sub_ids
        assert "magnification_mirror" in sub_ids


# ─── Unlocks (reverse REQUIRES) ───────────────────────────────────────────────

# ─── Limit & Include ──────────────────────────────────────────────────────────

class TestLimitAndInclude:
    def test_limit_caps_subtopics(self):
        """limit=1 returns at most 1 subtopic for phy_electricity."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "phy_electricity", "limit": 1},
        )
        assert res.status_code == 200
        assert len(res.json()["subtopics"]) <= 1

    def test_limit_caps_prerequisites(self):
        """limit=1 returns at most 1 prerequisite."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "resistance", "limit": 1},
        )
        assert res.status_code == 200
        assert len(res.json()["prerequisites"]) <= 1

    def test_include_prerequisites_only(self):
        """include=[prerequisites] → subtopics and unlocks are empty lists."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "lens", "include": ["prerequisites"]},
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["prerequisites"]) > 0
        assert data["subtopics"] == []
        assert data["parent"] is None
        assert data["unlocks"] == []

    def test_include_subtopics_only(self):
        """include=[subtopics] → prerequisites, parent, unlocks are empty/null."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "phy_electricity", "include": ["subtopics"]},
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["subtopics"]) > 0
        assert data["prerequisites"] == []
        assert data["parent"] is None
        assert data["unlocks"] == []

    def test_include_parent_only(self):
        """include=[parent] → only parent is populated for a non-chapter node."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "lens", "include": ["parent"]},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["parent"] is not None
        assert data["prerequisites"] == []
        assert data["subtopics"] == []
        assert data["unlocks"] == []

    def test_include_unlocks_only(self):
        """include=[unlocks] → only unlocks list is populated."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "snell_law", "include": ["unlocks"]},
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["unlocks"]) > 0
        assert data["prerequisites"] == []
        assert data["subtopics"] == []
        assert data["parent"] is None

    def test_include_multiple_types(self):
        """include=[prerequisites, unlocks] → both populated, subtopics empty."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "resistance", "include": ["prerequisites", "unlocks"]},
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["prerequisites"]) > 0
        assert len(data["unlocks"]) > 0
        assert data["subtopics"] == []

    def test_limit_too_high_returns_422(self):
        """limit > 50 is rejected with HTTP 422."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "lens", "limit": 99},
        )
        assert res.status_code == 422

    def test_limit_zero_returns_422(self):
        """limit=0 is rejected with HTTP 422."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "lens", "limit": 0},
        )
        assert res.status_code == 422

    def test_limit_and_include_combined(self):
        """limit=2 + include=[subtopics] returns at most 2 subtopics."""
        res = client.post(
            "/graph/neighbours",
            json={"topic": "phy_electricity", "include": ["subtopics"], "limit": 2},
        )
        assert res.status_code == 200
        assert len(res.json()["subtopics"]) <= 2


class TestUnlocks:
    def test_snell_law_unlocks_lens(self):
        """snell_law is REQUIRED BY lens → lens appears in unlocks."""
        res = client.post("/graph/neighbours", json={"topic": "snell_law"})
        assert res.status_code == 200
        unlock_ids = [u["topic_id"] for u in res.json()["unlocks"]]
        assert "lens" in unlock_ids

    def test_electric_current_unlocks_resistance(self):
        """electric_current is REQUIRED BY resistance → resistance in unlocks."""
        res = client.post("/graph/neighbours", json={"topic": "electric_current"})
        unlock_ids = [u["topic_id"] for u in res.json()["unlocks"]]
        assert "resistance" in unlock_ids

    def test_magnetic_field_unlocks_motor_and_induction(self):
        """magnetic_field is REQUIREd by electric_motor and electromagnetic_induction."""
        res = client.post("/graph/neighbours", json={"topic": "magnetic_field"})
        unlock_ids = [u["topic_id"] for u in res.json()["unlocks"]]
        assert "electric_motor" in unlock_ids
        assert "electromagnetic_induction" in unlock_ids
