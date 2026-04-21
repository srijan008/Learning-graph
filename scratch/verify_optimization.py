import requests
import json

def verify():
    url = "http://127.0.0.1:8002/api/v1/graph/curriculum?curriculum=neet"
    try:
        print(f"Fetching {url}...")
        resp = requests.get(url)
        print(f"Status: {resp.status_code}")
        print(f"Size: {len(resp.content)} bytes")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"Number of root items: {len(data)}")
            if data:
                neet = data[0]
                print(f"Name: {neet.get('name')}")
                subjects = [s["name"] for s in neet.get("subjects", [])]
                print(f"Subjects: {subjects}")
                
                # Check for non-NEET subjects
                all_subjects = []
                for root in data:
                    all_subjects.extend([s["name"] for s in root.get("subjects", [])])
                
                non_neet = [s for s in all_subjects if s not in ["Biology", "Zoology", "Physics", "Chemistry"]]
                if non_neet:
                    print(f"WARNING: Found non-NEET subjects: {non_neet}")
                else:
                    print("SUCCESS: Only NEET subjects found.")
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify()
