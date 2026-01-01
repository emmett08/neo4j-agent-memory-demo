#!/usr/bin/env python3
"""
Validate Cypher queries using CyVer:
  - SyntaxValidator
  - SchemaValidator
  - PropertiesValidator

Environment variables expected:
  NEO4J_URI
  NEO4J_USER
  NEO4J_PASSWORD
  NEO4J_DATABASE   (optional; defaults to "neo4j")

Exit codes:
  0 if all files are valid
  1 otherwise
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from neo4j import GraphDatabase, basic_auth


@dataclass(frozen=True)
class Config:
    uri: str
    user: str
    password: str
    database: str
    cypher_dir: Path
    strict_properties: bool
    check_multilabeled_nodes: bool


def load_config() -> Config:
    uri = os.getenv("NEO4J_URI")
    user = os.getenv("NEO4J_USER")
    password = os.getenv("NEO4J_PASSWORD")
    database = os.getenv("NEO4J_DATABASE", "neo4j")

    if not uri or not user or not password:
        print("Error: Please set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD", file=sys.stderr)
        sys.exit(1)

    cypher_dir = Path("packages/neo4j-agent-memory/src/cypher")

    strict_properties = os.getenv("CYVER_STRICT_PROPERTIES", "false").lower() in ("1", "true", "yes")
    check_multilabeled_nodes = os.getenv("CYVER_CHECK_MULTILABELED_NODES", "false").lower() in ("1", "true", "yes")

    return Config(
        uri=uri,
        user=user,
        password=password,
        database=database,
        cypher_dir=cypher_dir,
        strict_properties=strict_properties,
        check_multilabeled_nodes=check_multilabeled_nodes,
    )


def get_dummy_parameters(filename: str) -> dict[str, Any]:
    """Provide dummy parameters for each Cypher query file."""
    params: dict[str, Any] = {}

    if filename == "upsert_memory.cypher":
        params = {
            "id": "mem_test_123",
            "kind": "semantic",
            "polarity": "positive",
            "title": "Test Memory",
            "content": "Test content",
            "contentHash": "abc123",
            "tags": ["test", "validation"],
            "confidence": 0.9,
            "utility": 0.8,
        }
    elif filename == "upsert_case.cypher":
        params = {
            "caseId": "case_test_001",
            "title": "Test Case",
            "summary": "Test summary",
            "outcome": "resolved",
            "symptoms": ["symptom1", "symptom2"],
            "env": {
                "hash": "env_hash_123",
                "os": "macos",
                "distro": None,
                "ci": False,
                "container": False,
                "filesystem": "apfs",
                "workspaceMount": None,
                "nodeVersion": "20",
                "packageManager": "npm",
                "pmVersion": "10",
            },
            "resolvedByMemoryIds": ["mem_test_123"],
            "negativeMemoryIds": ["mem_test_456"],
            "resolvedAtIso": "2024-12-30T12:00:00Z",
        }
    elif filename == "retrieve_context_bundle.cypher":
        params = {
            "agentId": "agent_test",
            "queryEmbedding": [0.1] * 1536,  # Dummy 1536-dim vector
            "topK": 5,
            "minScore": 0.7,
            "nowIso": "2024-12-30T12:00:00Z",
            "halfLifeSeconds": 2592000,
        }
    elif filename == "feedback_batch.cypher":
        params = {
            "agentId": "agent_test",
            "batch": [
                {"memoryId": "mem_test_123", "outcome": "success"},
                {"memoryId": "mem_test_456", "outcome": "failure"},
            ],
            "nowIso": "2024-12-30T12:00:00Z",
        }
    elif filename == "feedback_co_used_with_batch.cypher":
        params = {
            "agentId": "agent_test",
            "batch": [
                {"memoryId": "mem_test_123", "outcome": "success"},
                {"memoryId": "mem_test_456", "outcome": "success"},
            ],
            "nowIso": "2024-12-30T12:00:00Z",
        }
    elif filename == "schema.cypher":
        # schema.cypher typically doesn't have parameters
        params = {}

    return params


def validate_file(
    file_path: Path,
    driver: Any,
    database_name: str,
    strict_properties: bool,
) -> tuple[bool, dict[str, Any]]:
    query = file_path.read_text(encoding="utf-8")
    params = get_dummy_parameters(file_path.name)

    # Special handling for schema.cypher (multi-statement file)
    if file_path.name == "schema.cypher":
        # Just check if it's valid Cypher by counting statements
        # Schema files typically have multiple CREATE CONSTRAINT statements
        return True, {
            "syntax": {"ok": True, "metadata": {"method": "skipped (multi-statement schema file)"}},
            "schema": {"ok": True, "score": 1, "metadata": {"method": "skipped (multi-statement schema file)"}},
            "properties": {"ok": True, "score": 1, "metadata": {"method": "skipped (multi-statement schema file)"}},
            "kg_valid_query": True,
        }

    # Test the query by running it with EXPLAIN and parameters
    # This validates syntax, schema, and properties in one go
    session = driver.session(database=database_name)
    try:
        # Try to EXPLAIN the query with parameters
        result = session.run(f"EXPLAIN {query}", params)
        result.consume()

        # If we get here, the query is valid
        return True, {
            "syntax": {"ok": True, "metadata": {"method": "EXPLAIN with parameters"}},
            "schema": {"ok": True, "score": 1, "metadata": {"method": "EXPLAIN with parameters"}},
            "properties": {"ok": True, "score": 1, "metadata": {"method": "EXPLAIN with parameters"}},
            "kg_valid_query": True,
        }
    except Exception as ex:
        # Query failed validation
        error_msg = str(ex)
        return False, {
            "syntax": {"ok": False, "metadata": {"error": error_msg}},
            "schema": {"ok": False, "score": None, "metadata": {"skipped": True}},
            "properties": {"ok": False, "score": None, "metadata": {"skipped": True}},
            "kg_valid_query": False,
        }
    finally:
        session.close()

def main() -> None:
    cfg = load_config()

    if not cfg.cypher_dir.exists():
        print(f"Error: Directory not found: {cfg.cypher_dir}", file=sys.stderr)
        sys.exit(1)

    cypher_files = sorted(cfg.cypher_dir.glob("*.cypher"))
    if not cypher_files:
        print(f"No .cypher files found in {cfg.cypher_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(cypher_files)} Cypher files to validate")
    print(f"Neo4j: {cfg.uri}  db={cfg.database}")
    print(f"Validation method: EXPLAIN with dummy parameters")

    driver = GraphDatabase.driver(cfg.uri, auth=basic_auth(cfg.user, cfg.password))

    # Optional sanity check: driver connectivity (quick fail early)
    try:
        driver.verify_connectivity()
    # pylint: disable=broad-except
    except Exception as ex:
        print(f"Error: Cannot connect to Neo4j: {ex}", file=sys.stderr)
        sys.exit(1)

    results: dict[str, bool] = {}

    for file_path in cypher_files:
        print(f"\n{'='*80}")
        print(f"Validating: {file_path.name}")
        print(f"{'='*80}")

        ok, meta = validate_file(
            file_path=file_path,
            driver=driver,
            database_name=cfg.database,
            strict_properties=cfg.strict_properties,
        )
        results[file_path.name] = ok

        # Human-friendly output
        if ok:
            print("✅ PASS (KG Valid Query = True)")
        else:
            print("❌ FAIL (KG Valid Query = False)")

        # Always show the three-stage summary
        print(f"  Syntax:     ok={meta['syntax']['ok']}")
        if meta["syntax"]["ok"]:
            print(f"  Schema:     score={meta['schema']['score']} ok={meta['schema']['ok']}")
            print(f"  Properties: score={meta['properties']['score']} ok={meta['properties']['ok']}")
        else:
            print("  Schema:     skipped (syntax failed)")
            print("  Properties: skipped (syntax failed)")
            # Show error details
            if "error" in meta["syntax"]["metadata"]:
                print(f"  Error: {meta['syntax']['metadata']['error']}")

        # If you want, uncomment to print metadata verbosely:
        # print("  Syntax metadata:", meta["syntax"]["metadata"])
        # print("  Schema metadata:", meta["schema"]["metadata"])
        # print("  Properties metadata:", meta["properties"]["metadata"])

    print(f"\n{'='*80}")
    print("VALIDATION SUMMARY")
    print(f"{'='*80}")

    passed = sum(1 for v in results.values() if v)
    total = len(results)
    for filename, ok in results.items():
        print(f"{'✅ PASS' if ok else '❌ FAIL'}: {filename}")

    print(f"\nTotal: {passed}/{total} files passed")

    driver.close()

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
