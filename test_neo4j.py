
import os
from db.neo4j_client import get_session
from routers.graph import _resolve_node

def test_resolve(tid):
    print(f"Resolving: {tid}")
    with get_session() as session:
        node = _resolve_node(session, tid)
        if node:
            print(f"Found Node: {dict(node)}")
        else:
            print("Node not found.")

if __name__ == "__main__":
    test_resolve("687c94dc-2872-4e65-bdf1-ffc14b315592")
    test_resolve("082a3490-0650-4723-a42f-b02e651b6904")
