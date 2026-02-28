import urllib.request, json, time
t = time.time()
r = urllib.request.urlopen("http://localhost:8000/api/predict/MONDO_0004975?top_k=5", timeout=15)
data = json.loads(r.read())
elapsed = time.time() - t
print(f"Predict OK in {elapsed:.2f}s - {len(data['candidates'])} candidates for {data['disease_name']}")
for c in data["candidates"]:
    print(f"  #{c['rank']} {c['drug_name']}  score={c['score']}  conf={c['confidence']}")
