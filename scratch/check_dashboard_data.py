import asyncio
import httpx

async def check_data():
    async with httpx.AsyncClient() as client:
        user = "user_123"
        base_url = "http://127.0.0.1:8002/api/v1"
        
        # Check Journey
        r_j_list = await client.get(f"{base_url}/journey/list/{user}")
        journeys = r_j_list.json()
        print(f"Journeys found: {len(journeys)}")
        if journeys:
            j_id = journeys[0]['id']
            r_j_detail = await client.get(f"{base_url}/journey/{j_id}")
            nodes = r_j_detail.json().get('nodes', [])
            done_nodes = [n for n in nodes if n.get('status') == 'completed']
            print(f"Journey Nodes: Total={len(nodes)}, Completed={len(done_nodes)}")
        
        # Check Metrics
        r_metrics = await client.get(f"{base_url}/dashboard/{user}/topic-metrics")
        metrics = r_metrics.json().get('topics', [])
        completed_metrics = [m for m in metrics if m.get('completion_percentage') == 100]
        print(f"Topic Metrics: Total={len(metrics)}, 100% Completed={len(completed_metrics)}")
        
        # Check Recent Completions
        r_recent = await client.get(f"{base_url}/dashboard/{user}/recent-completions")
        recent = r_recent.json().get('completions', [])
        print(f"Recent Completions: {len(recent)}")

if __name__ == "__main__":
    asyncio.run(check_data())
