import requests
import json

def check():
    url = "http://127.0.0.1:8002/api/v1/graph/curriculum?curriculum=neet"
    try:
        resp = requests.get(url)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"Error Body: {resp.text}")
            return
            
        data = resp.json()
        print(f"Count of curricula: {len(data)}")
        if data:
            neet = data[0]
            print(f"Curriculum Name: {neet.get('name')}")
            for sub in neet.get("subjects", []):
                chapters = sub.get("chapters", [])
                print(f"  Subject: {sub.get('name')} ({len(chapters)} chapters)")
                if chapters:
                    ch = chapters[0]
                    topics = ch.get("topics", [])
                    print(f"    First Chapter: {ch.get('name')} ({len(topics)} topics)")
        else:
            print("Response is empty!")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check()
