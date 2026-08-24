import json
import os

path = "C:\\Users\\Swabhav\\.claude.json"
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print("Keys of .claude.json:", list(data.keys()))
    # search for password or postgres
    def search_dict(d, q):
        matches = []
        if isinstance(d, dict):
            for k, v in d.items():
                if q in k.lower():
                    matches.append((k, str(v)[:100]))
                if isinstance(v, (dict, list)):
                    matches.extend(search_dict(v, q))
        elif isinstance(d, list):
            for item in d:
                matches.extend(search_dict(item, q))
        return matches

    for term in ['password', 'postgres', 'supabase', 'key', 'secret']:
        m = search_dict(data, term)
        if m:
            print(f"Matches for '{term}':", m[:10])
else:
    print(".claude.json not found")
