#!/usr/bin/env python3
"""Refresh public headline and Dordrecht weather snapshots for SchermLoop."""
import datetime as dt
import html
import json
import math
from pathlib import Path
import re
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "live-data.json"
LAT, LON = 51.79103, 4.68571

def fetch(url):
    request = Request(url, headers={"User-Agent": "SchermLoop/1.0 (news and weather display)", "Accept": "*/*"})
    with urlopen(request, timeout=25) as response:
        return response.read()

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def distance(station):
    lat, lon = float(station["lat"]), float(station["lon"])
    return (lat-LAT)**2 + ((lon-LON)*math.cos(math.radians(LAT)))**2

def main():
    try:
        data = json.loads(OUT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {"news": {}, "weather": {}}

    try:
        feed = ET.fromstring(fetch("https://www.nu.nl/rss/Algemeen"))
        headlines = []
        for item in feed.findall(".//channel/item"):
            title = html.unescape(item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            if title and link.startswith("https://www.nu.nl/"):
                raw_description = item.findtext("description") or ""
                summary = html.unescape(re.sub(r"<[^>]*>", " ", raw_description))
                summary = re.sub(r"\\s+", " ", summary).strip()
                if summary.startswith(title):
                    summary = summary[len(title):].lstrip(" .:-")
                if len(summary) > 320:
                    summary = summary[:317].rsplit(" ", 1)[0] + "..."
                image_url = ""
                for element in item.iter():
                    tag = element.tag.lower()
                    url = element.get("url", "")
                    if not url and tag.endswith("image"):
                        url = (element.text or "").strip()
                    if not url.startswith("https://"):
                        continue
                    host = (urlsplit(url).hostname or "").lower()
                    if host != "nu.nl" and not host.endswith(".nu.nl"):
                        continue
                    if tag.endswith("enclosure") and not element.get("type", "").startswith("image/"):
                        continue
                    if tag.endswith(("enclosure", "thumbnail", "content", "image")):
                        image_url = url
                        break
                headlines.append({"title": title[:180], "url": link, "date": item.findtext("pubDate") or "",
                                  "summary": summary, "imageUrl": image_url})
            if len(headlines) >= 7:
                break
        if not headlines:
            raise ValueError("NU.nl RSS returned no headlines")
        data["news"] = {"source": "NU.nl", "updatedAt": now(), "headlines": headlines}
        print("NU.nl: headlines updated", len(headlines))
    except Exception as exc:
        print("NU.nl unavailable; preserving previous snapshot:", repr(exc))

    weather = dict(data.get("weather") or {})
    try:
        feed = json.loads(fetch("https://data.buienradar.nl/2.0/feed/json"))
        stations = [s for s in feed.get("actual", {}).get("stationmeasurements", [])
                    if s.get("lat") is not None and s.get("lon") is not None
                    and s.get("temperature") is not None]
        station = min(stations, key=distance)
        weather.update({"source": "Buienradar", "place": "Dordrecht",
                        "temperature": station.get("temperature"),
                        "description": station.get("weatherdescription") or "Actueel weer",
                        "station": station.get("stationname") or "",
                        "weatherUpdatedAt": now()})
        print("Buienradar: current temperature updated")
    except Exception as exc:
        print("Buienradar current weather unavailable; preserving snapshot:", repr(exc))
    try:
        url = f"https://gpsgadget.buienradar.nl/data/raintext/?lat={LAT:.5f}&lon={LON:.5f}"
        text = fetch(url).decode("utf-8", errors="replace")
        points = []
        for line in text.splitlines():
            match = re.fullmatch(r"\s*(\d{1,3})\|(\d{2}:\d{2})\s*", line)
            if not match:
                continue
            raw = max(0, min(255, int(match.group(1))))
            mm_hour = round(10 ** ((raw - 109) / 32), 2) if raw else 0.0
            points.append({"time": match.group(2), "mmHour": mm_hour})
        if len(points) < 10:
            raise ValueError("Missing precipitation points")
        weather.update({"rain": points[:26], "rainUpdatedAt": now()})
        print("Buienradar: rain prediction updated", len(points))
    except Exception as exc:
        print("Buienradar rain unavailable; preserving snapshot:", repr(exc))
    data["weather"] = weather
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
