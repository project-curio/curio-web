# Seed Data Acquisition Workflow

## Purpose Within Curio

Curio exists to surface trustworthy reflections about cultural institutions. To do that responsibly, we need a clean, inclusive institution catalog before Phase 2 launches member reflections or Phase 3 unlocks institutional analytics. The seed data workflow is how we bootstrap that catalog: it pulls listings from public data sources, standardizes them, routes them through human review, and writes the final, provenance-rich records into Supabase so every future feature (maps, Reflection Index, Wish Index, and institutional onboarding) starts from dependable source material.

This guide documents the full, no-assumptions pipeline for seeding Curio’s institution catalog with high-quality data from Google Places, Yelp Fusion, TripAdvisor, and OpenStreetMap (OSM). It standardizes how we acquire API credentials, configure Supabase, orchestrate automated cleaning/validation, and run the human-in-the-loop review inside Google Sheets before finalizing records. Use it every time you ingest a new city or rerun Detroit to maintain consistency, auditability, and alignment with the “reflections over ratings” principles in `AGENTS.md`.

---

## Before You Begin

Make sure you have:

1. A Supabase account with permission to create projects.
2. A Google Cloud account with billing enabled (required for Places + Geocoding APIs).
3. Yelp Fusion and (ideally) TripAdvisor Content API access. TripAdvisor approvals can take multiple days—plan ahead.
4. A Google Workspace or Gmail account for Sheets + Colab.
5. Familiarity with sharing secrets securely (1Password, Bitwarden, etc.); never paste live keys into GitHub issues or commits.
6. Enough time to complete the process end-to-end (expect ~60–90 minutes for Detroit once you have keys).

Tip: keep a checklist (or duplicate this doc into Notion) for each city so nothing gets skipped.

### How to Use the Colab Notebook (No Assumptions)

1. Go to [https://colab.research.google.com](https://colab.research.google.com) and sign in with the same Google account you used for Sheets.
2. Each gray code block in this guide maps to one Colab cell. Click the **+ Code** button in Colab, paste the block, then click the ▶︎ “Run” button on the left of that cell.
3. Run cells **from top to bottom**. Do not skip ahead—earlier cells define variables that later cells need.
4. If Colab restarts (it will show “Runtime disconnected”), rerun every cell from the top until you reach the step you were on.
5. When the instructions say “edit this line,” double-click inside the cell, make the change, then run the cell again.
6. Keep Colab and this guide side-by-side so you can copy/paste without retyping. Easiest approach: open this markdown file in one browser window, Colab in another, then drag the windows so they sit left/right on your screen.

---

## 0. What We Are Building

We are shipping a repeatable pipeline that:

1. **Gets Data** — pulls cultural institutions for Detroit (or another city) from Google Places, Yelp Fusion, TripAdvisor, and OSM.
2. **Stores Raw Data** — writes each raw payload to `public.ingested_institutions_raw` in Supabase alongside its source metadata.
3. **Validates & Cleans** — runs automated cleaning (names, addresses, URLs) and cross-source validation, producing `FLAG` + `FLAG_REASON`.
4. **Human Review** — pushes the cleaned candidates to a Google Sheet so a reviewer can mark `KEEP=YES` or fix issues inline.
5. **Pulls Approved Data** — Colab only processes sheet rows that have `KEEP=YES`.
6. **Merges & Enriches** — fuses all matching source rows, builds a ≤300-character `short_description` via a smart priority order, and saves an `auto_payload` JSON bundle for traceability.
7. **Writes Final Records** — upserts the merged entry into `public.institutions`.
8. **Links Sources** — records which raw rows powered each final institution via `public.institution_source_links`.

---

## 1. Supabase Project Setup

### 1.1 Create the Project
1. Visit [https://app.supabase.com](https://app.supabase.com) and log in.
2. Click **New project**.
3. Name it `curio`, choose the correct organization/workspace, and create a strong database password (store it securely).
4. Click **Create new project** and wait for the dashboard to finish provisioning.

### 1.2 Capture API Credentials
1. In the left sidebar, click **Settings → API**.
2. Copy the **Project URL** (e.g., `https://xxxxx.supabase.co`) and the **anon public key**.
3. Store them locally; they will be referenced as:
   ```text
   SUPABASE_URL = https://YOUR-PROJECT.supabase.co
   SUPABASE_KEY = YOUR-SUPABASE-ANON-KEY
   ```
4. Never commit real keys to the repository.

---

## 2. Create the Canonical Tables

All schema is created through the Supabase SQL editor. For every block below:

1. In the Supabase dashboard, go to **Database → SQL editor**.
2. Click **+ New query** (or reuse the current tab) so you have a clean editor.
3. Paste the SQL and press **Run** (the ▶︎ button). There’s no extra “Save” step unless you want to bookmark the script via the optional **Save** dropdown.

Run each block independently so errors are easier to diagnose.

### 2.1 `public.institutions`
```sql
create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  plan text not null default 'public'
    check (plan in ('public','basic','culture_free','pro','institutional')),
  is_claimed boolean not null default false,
  source_system text,
  source_record_id text,
  auto_payload jsonb,
  auto_confidence numeric default 0.0,
  short_description text,
  long_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists institutions_slug_idx on public.institutions(slug);
```

### 2.2 Confirm the Table in the Supabase Table Editor
1. In the left navigation, click **Table editor** (under **Database**).
2. Make sure the schema selector is set to `public`, then search for `institutions`.
3. Click the table name and confirm the columns you just created appear.

This verification step matters because every later table references `public.institutions`. Catching typos or failed runs now prevents confusing foreign-key errors later. Repeat this quick check after each schema change in this section.

### 2.3 `public.ingestion_sources`

This table is the catalog of “where to fetch data from.” Every subsequent seed (2.4) and scraper step (Section 7) relies on it, so create it immediately after `public.institutions`:

1. Open **SQL editor → + New query**, paste the block, and click **Run**. Supabase should respond with `CREATE TABLE`.
2. Open **Table editor → public.ingestion_sources** to confirm the columns (`code`, `url`, `parser`, etc.) exist. Leave this tab handy—you will use it again in §2.4 to confirm the Detroit rows were inserted correctly.

```sql
create table if not exists public.ingestion_sources (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  url text not null,
  parser text,
  active boolean default true,
  created_at timestamptz default now()
);
```

### 2.4 Seed the Four Detroit Sources

“Seeding” here simply means inserting the starter rows that describe which external sources the ingestion notebook should call for Detroit. Run these steps once per city (they are safe to rerun because of the `on conflict do nothing` clause):

1. Open the Supabase **SQL editor → + New query** tab.
2. Paste the block below and click **Run**. The console should report `INSERT 0 5` (or similar) the first time, and `INSERT 0 0` on reruns.
3. Switch to **Table editor → public.ingestion_sources**, filter `code` with `detroit`, and confirm the five rows exist with the expected `parser` + `url` values. This check matters because every downstream fetcher references these codes; if they are missing or mistyped, the Colab notebook will have nothing to retrieve.

```sql
insert into public.ingestion_sources (code, url, parser)
values
  ('yelp-detroit-museums', 'https://api.yelp.com/v3/businesses/search', 'yelp'),
  ('google-places-detroit', 'https://maps.googleapis.com/maps/api/place/nearbysearch/json', 'google_places'),
  ('tripadvisor-detroit', 'https://api.tripadvisor.com/api/partner/2.0/map', 'tripadvisor'),
  ('osm-detroit', 'https://overpass-api.de/api/interpreter', 'osm'),
  ('wikidata-detroit', 'https://query.wikidata.org/sparql', 'wikidata')
on conflict (code) do nothing;
```

### 2.5 `public.ingested_institutions_raw`

This table stores every raw payload exactly as it arrived from Google, Yelp, TripAdvisor, etc. Create it before you run the Colab scraper:

1. Open **SQL editor → + New query** and paste the block.
2. Press **Run**; Supabase should confirm with `CREATE TABLE`.
3. Verify the structure inside **Table editor → public.ingested_institutions_raw** so you can see the `source_id`, `raw_blob`, and `processed` columns the notebook relies on. Catching a typo now avoids runtime errors later when the script tries to insert raw rows.

```sql
create table if not exists public.ingested_institutions_raw (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.ingestion_sources(id) on delete set null,
  source_code text,
  raw_name text,
  raw_url text,
  raw_address text,
  raw_blob jsonb,
  processed boolean default false,
  created_at timestamptz default now()
);
```

### 2.6 `public.institution_source_links`

Once institutions are merged, this table records which raw rows fed into each final entry (provenance for analytics and audits). Build it right after the raw table so you do not forget later:

1. Open **SQL editor → + New query**, paste the block, and click **Run**.
2. Open **Table editor → public.institution_source_links** and confirm the columns (`institution_id`, `raw_id`, `source_code`) appear. You will use this grid in §11 to make sure every merged institution has the correct links.

```sql
create table if not exists public.institution_source_links (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  raw_id uuid not null references public.ingested_institutions_raw(id) on delete cascade,
  source_code text,
  created_at timestamptz default now(),
  unique (institution_id, raw_id)
);
```

### 2.7 RLS Reminder
Keep Row Level Security **disabled** on these four tables until ingestion is complete or you have written explicit policies for the Colab service account.

---

## 3. Third-Party API Credentials

| Source | Steps |
| --- | --- |
| **Google Places + Geocoding** | 1. Navigate to [Google Cloud Console](https://console.cloud.google.com). 2. Create/select project `Curio Places API`. 3. Enable **Places API** and **Geocoding API**. 4. Go to **APIs & Services → Credentials → + CREATE CREDENTIALS → API key**. 5. Store as `GOOGLE_PLACES_KEY`. |
| **Yelp Fusion** | 1. Visit [https://www.yelp.com/developers/v3/manage_app](https://www.yelp.com/developers/v3/manage_app). 2. Log in → **Create App** (name `Curio Detroit Ingestion`). 3. Copy the generated key as `YELP_API_KEY`. |
| **TripAdvisor Content API** | 1. Go to [https://www.tripadvisor.com/developers](https://www.tripadvisor.com/developers). 2. Request access to the Partner/Content API describing the Curio use case (public listings, cultural insight). 3. After approval, store the key as `TRIPADVISOR_API_KEY`. The notebook gracefully skips TripAdvisor when the key is blank. |
| **OpenStreetMap** | No key required; we use the Overpass API endpoint. |

### 3.1 If TripAdvisor Access Is Still Pending
TripAdvisor approvals can take a few days. Do **not** block the entire ingestion:

1. Leave `TRIPADVISOR_API_KEY = ""` in §5.6. The fetcher logs a friendly skip message.
2. Run the rest of the workflow to ingest Google, Yelp, and OSM data.
3. Once TripAdvisor sends the key, set `TRIPADVISOR_API_KEY = "real-key"` and rerun **only Steps 5.6 + 5.7 + 7–11**:
   - In §5.7 (immediately after you filter sources by city), add this line so only TripAdvisor runs:
     ```python
     sources = [s for s in sources if s["code"] == "tripadvisor-detroit"]
     ```
     When you finish the TripAdvisor catch-up, delete that line so future runs include all sources again.
   - Execute the scrape, push to Sheets, review (TripAdvisor rows only), and merge/upsert again. Step 8’s merge logic keeps all prior `KEEP=YES` decisions intact because it joins on `bucket_key`.
   - Google/Yelp/OSM rows will stay untouched: their raw rows were cleared at the beginning of §7, and their reviewer decisions remain in Sheets because of the merge.

Document the rerun in your project log so we know when TripAdvisor coverage landed.

---

## 4. Google Sheet for Human Review

1. Open [Google Sheets](https://sheets.google.com) while signed into the Google account you’ll use for Colab.
2. Click **Blank** to create a new spreadsheet.
3. In the top-left title field, type **Curio – Ingestion Review** and press Enter.
4. At the bottom, right-click the `Sheet1` tab → **Rename** → type **Detroit** (create one tab per city as you expand).
5. Click **File → Settings → Locale** and choose the city’s country (e.g., United States) so dates/numbers format correctly.
6. Click the purple **Share** button → add teammates who will review rows as **Editor** → click **Copy link** → paste that link into a note or the Colab notebook (you’ll need it later) → click **Done**. (Colab inherits your account permissions, so there’s no need to make the sheet public.)
7. Leave the sheet open in a browser tab while you work; when Colab pushes updates you can switch back immediately without searching for it.

Google Sheets is the canonical review surface—no CSV exports. All reviewers work from the shared sheet so we have a single source of truth with built-in version history.

---

## 5. Google Colab Notebook

### 5.1 Create Notebook
1. Navigate to [Google Colab](https://colab.research.google.com).
2. Create a new notebook named `curio_ingest_detroit`.

### 5.2 Install Python Dependencies
Create a **new code cell** (click **+ Code**), paste the command below, and click the ▶︎ run button. This installs every library the notebook uses (HTTP calls, dataframes, Google Sheets helpers). You must run it once per fresh Colab session because environments reset when the runtime disconnects.
```python
!pip install requests beautifulsoup4 python-slugify pandas gspread gspread_dataframe
```
Expected output: a progress log ending with `Successfully installed ...`. If you see errors, rerun the cell—temporary Colab network hiccups sometimes require a second attempt.

### 5.3 Google Auth + Sheets Client
In the next code cell, paste and run the block below. It handles two things:
- `auth.authenticate_user()` opens the OAuth prompt so Colab can access your Google Drive/Sheets. Follow the link, choose the same Google account you used to create the Sheet, and paste the auth code back into the dialog.
- The remaining imports build an authenticated `gspread` client we reuse later.

```python
from google.colab import auth
auth.authenticate_user()
# A new browser tab pops up asking for permission. Click the link, choose your Google account,
# and copy the long authorization code back into the Colab prompt. Colab will say "Authenticated"
# when it succeeds.

import gspread
from gspread_dataframe import set_with_dataframe, get_as_dataframe
from google.auth import default
import pandas as pd
creds, _ = default()
gc = gspread.authorize(creds)
```
When the cell finishes you should see `Authenticated` in the Colab output pane.

### 5.4 Open / Create the Master Sheet
Add another code cell, paste this snippet, and run it. The script looks for a Google Sheet named **Curio – Ingestion Review**; if it doesn’t exist yet, Colab creates it for you. The printed URL is the one you’ll share with reviewers.
```python
MASTER_SHEET_NAME = "Curio – Ingestion Review"
try:
  sh = gc.open(MASTER_SHEET_NAME)
  print("Found existing sheet:", MASTER_SHEET_NAME)
except gspread.SpreadsheetNotFound:
  sh = gc.create(MASTER_SHEET_NAME)
  print("Created new sheet:", MASTER_SHEET_NAME)
print("Sheet URL:", sh.url)
# Double-check the Google account name shown in the Colab output matches the one listed in the top-right
# of the Google Sheet tab. If they differ, sign into the correct account in either Colab or Sheets before continuing.
```
Confirm the link opens the expected spreadsheet before moving on.

### 5.5 City + Supabase Credentials
Use the next cell to define which city you are working on and connect to Supabase:

1. Update `CITY` (lowercase) to match the city slug used in your ingestion source codes; `CITY_TITLE` auto-capitalizes it for display.
2. Replace `SUPABASE_URL` / `SUPABASE_KEY` with the exact values from §1.2.
3. Run the cell. The final `health_resp` call should print `Supabase test status: 200`. Any other status means the URL or key is wrong—fix the strings and rerun this cell until it succeeds.

```python
CITY = "detroit"
CITY_TITLE = CITY.title()

# Keep CITY lowercase and matching the city slug used in your ingestion source codes
# (e.g., "yelp-detroit-museums" expects CITY = "detroit"). When switching cities, update
# the string but keep it lowercase ("chicago", "toronto", etc.).

SUPABASE_URL = "https://YOUR-PROJECT.supabase.co"
SUPABASE_KEY = "YOUR-SUPABASE-ANON-KEY"

import requests
headers = {
  "apikey": SUPABASE_KEY,
  "Authorization": f"Bearer {SUPABASE_KEY}",
  "Content-Type": "application/json"
}

# Quick connection test — this should print status 200
health_resp = requests.get(f"{SUPABASE_URL}/rest/v1/ingestion_sources?select=code&limit=1", headers=headers)
print("Supabase test status:", health_resp.status_code)
if health_resp.status_code != 200:
  raise SystemExit("Supabase credentials look wrong. Double-check SUPABASE_URL and SUPABASE_KEY, then rerun this cell.")
```
**Edit tips:** replace `YOUR-PROJECT` and `YOUR-SUPABASE-ANON-KEY` with the exact values you copied from Supabase. Keep the quotation marks. If you paste the wrong value, rerun the cell after fixing it.

### 5.6 Third-Party Keys
Still in the same notebook, add a new cell for your external API credentials. Paste the code below, fill in the strings, and run it. The variables live in memory for the rest of the session; you never print the actual keys anywhere.
```python
YELP_API_KEY = "paste-your-yelp-key-here"
GOOGLE_PLACES_KEY = "paste-your-google-places-key-here"
TRIPADVISOR_API_KEY = "paste-your-tripadvisor-key-here"  # leave blank to skip
```
Copy each API key exactly as issued by the provider. If you do not have the TripAdvisor key yet, leave the empty string (`""`) and the script will skip that source.

### 5.7 Confirm Supabase Sources
Finally, add another code cell with the block below. It fetches every row from `public.ingestion_sources`, filters them by the current city, and prints the active codes so you can sanity-check the setup before scraping. Run it after §2.4 is complete.
```python
resp = requests.get(f"{SUPABASE_URL}/rest/v1/ingestion_sources?active=eq.true", headers=headers)
sources = resp.json()
print("Sources found:", len(sources))
for s in sources:
  print(f" - {s['code']} ({s['parser']})")

# Keep only the sources for the current city (assumes each code contains the city slug)
sources = [s for s in sources if CITY in s["code"]]
print("Active city sources:", [s["code"] for s in sources])

# If this prints an empty list, stop here and double-check that your ingestion source codes include the city name.
if not sources:
  raise SystemExit(
    "No sources matched this city.\n"
    "Fix: Open Supabase → Table Editor → ingestion_sources. For each row that should belong to this city, edit the `code`\n"
    f"so it includes the city slug (e.g., yelp-{CITY}-museums). Click Save, then rerun this cell."
  )
```
Expected: four Detroit sources. If `0`, rerun the SQL seed from §2.4.

---

## 6. Helper Functions (Auto-Clean & Validation)

Paste the entire block below into a single Colab cell. It includes cleaners, fetchers for all four sources, validation helpers, the short-description builder, and the merge logic. Run the cell once to register the functions for later steps—nothing executes yet.

```python
import re, unicodedata, time
from slugify import slugify
from collections import defaultdict
from urllib.parse import urlparse

# --- PRE-CLEANING HELPERS ---

def clean_name(name: str) -> str:
  if not name: return ""
  name = re.sub(r"\s+", " ", name).strip()
  parts = []
  for part in name.split(" "):
    if len(part) <= 3 and part.isupper():
      parts.append(part)
    else:
      parts.append(part.title())
  return " ".join(parts)

def clean_address(addr: str) -> str:
  if not addr: return ""
  return re.sub(r"\s+", " ", addr).strip()

def clean_url(url: str) -> str:
  if not url: return ""
  url = url.strip()
  if not url.startswith("http://") and not url.startswith("https://"):
    url = "https://" + url
  return url

def clean_row_for_sheet(row: dict) -> dict:
  out = dict(row)
  out["raw_name"] = clean_name(row.get("raw_name") or "")
  out["raw_address"] = clean_address(row.get("raw_address") or "")
  out["raw_url"] = clean_url(row.get("raw_url") or "") if row.get("raw_url") else ""
  return out

def normalize_address_key(addr: str) -> str:
  if not addr: return ""
  return clean_address(addr).lower()

def normalize_name(name: str) -> str:
  if not name: return ""
  n = name.lower().strip()
  n = unicodedata.normalize('NFKD', n).encode('ascii', 'ignore').decode('utf-8')
  n = re.sub(r"\(.*?\)", "", n) # remove text in parens
  n = re.sub(r"\bmuseum\b", "", n)
  n = re.sub(r"\bthe\b", "", n)
  n = re.sub(r"[^a-z0-9\s]", "", n) # remove punctuation
  n = re.sub(r"\s+", " ", n).strip()
  return n

# --- SOURCE PRIORITY ---

SOURCE_PRIORITY = [
  "google-places-detroit", # Best for details/hours
  "tripadvisor-detroit",   # Best for descriptions
  "yelp-detroit-museums",  # Best for categories/address
  "wikidata-detroit",      # Best for authoritative IDs
  "osm-detroit"            # Best for long-tail/parks
]

# --- FETCHERS ---

def fetch_google_place_details(place_id: str):
  if not GOOGLE_PLACES_KEY: return None
  url = "https://maps.googleapis.com/maps/api/place/details/json"
  params = {
    "key": GOOGLE_PLACES_KEY,
    "place_id": place_id,
    "fields": "name,formatted_address,formatted_phone_number,website,opening_hours,editorial_summary,types,geometry"
  }
  try:
    r = requests.get(url, params=params, timeout=20)
    data = r.json()
    if data.get("status") != "OK": return None
    return data.get("result")
  except Exception as e:
    print(f"  [Google Details Error]: {e}")
    return None

def fetch_google_places_detroit(place_type="museum"):
  if not GOOGLE_PLACES_KEY: return []
  center = {"lat": 42.3314, "lng": -83.0458}
  url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
  base_params = {
    "key": GOOGLE_PLACES_KEY,
    "location": f"{center['lat']},{center['lng']}",
    "radius": 15000, # 15km
    "type": place_type
  }
  all_results = []
  next_page_token = None
  try:
    while True:
      params = dict(base_params)
      if next_page_token:
        params["pagetoken"] = next_page_token
        time.sleep(2)  # Google requires a short delay before using next_page_token
      r = requests.get(url, params=params, timeout=20)
      data = r.json()
      for p in data.get("results", []):
        details = fetch_google_place_details(p["place_id"])
        all_results.append({
          "raw_name": p.get("name"),
          "raw_url": f"https://www.google.com/maps/place/?q=place_id:{p.get('place_id')}",
          "raw_address": p.get("vicinity"),
          "raw_blob": { "nearby": p, "details": details }
        })
      next_page_token = data.get("next_page_token")
      if not next_page_token:
        break
    return all_results
  except Exception as e:
    print(f"  [Google Nearby Error]: {e}")
    return []

def fetch_yelp_detroit():
  if not YELP_API_KEY:
    print("  [Yelp Info] Skipping Yelp, no API key set.")
    return []
  url = "https://api.yelp.com/v3/businesses/search"
  headers_yelp = {"Authorization": f"Bearer {YELP_API_KEY}"}
  params = { "location": "Detroit, MI", "categories": "museums,galleries,parks,landmarks", "limit": 50 }
  try:
    r = requests.get(url, headers=headers_yelp, params=params, timeout=20)
    data = r.json()
    out = []
    for b in data.get("businesses", []):
      out.append({
        "raw_name": b.get("name"),
        "raw_url": b.get("url"),
        "raw_address": ", ".join(b.get("location", {}).get("display_address", [])),
        "raw_blob": b
      })
    return out
  except Exception as e:
    print(f"  [Yelp Error]: {e}")
    return []

def fetch_tripadvisor_detroit():
  if not TRIPADVISOR_API_KEY:
    print("  [TripAdvisor Info] Skipping TripAdvisor, no API key set.")
    return []
  detroit_lat, detroit_lng = 42.3314, -83.0458
  url = f"https://api.tripadvisor.com/api/partner/2.0/map/{detroit_lat},{detroit_lng}"
  headers_ta = {"X-TripAdvisor-API-Key": TRIPADVISOR_API_KEY}
  params = { "radius": 15, "lunit": "km", "categories": "attractions" }
  try:
    r = requests.get(url, headers=headers_ta, params=params, timeout=30)
    if r.status_code != 200:
      print(f"  [TripAdvisor Error]: {r.status_code} {r.text[:100]}")
      return []
    data = r.json()
    out = []
    for item in data.get("data", []):
      if not item.get("name"): continue
      out.append({
        "raw_name": item.get("name"),
        "raw_url": item.get("web_url"),
        "raw_address": item.get("address_obj", {}).get("address_string"),
        "raw_blob": item
      })
    return out
  except Exception as e:
    print(f"  [TripAdvisor Error]: {e}")
    return []

def fetch_osm_detroit():
  overpass_url = "https://overpass-api.de/api/interpreter"
  query = """
  [out:json][timeout:25];
  (
    node["tourism"="museum"](42.2,-83.3,42.45,-82.9);
    node["tourism"="artwork"](42.2,-83.3,42.45,-82.9);
    node["amenity"="library"](42.2,-83.3,42.45,-82.9);
    node["leisure"="park"](42.2,-83.3,42.45,-82.9);
    node["historic"](42.2,-83.3,42.45,-82.9);
  );
  out center;
  """
  for attempt in range(3):
    try:
      r = requests.post(overpass_url, data={"data": query}, timeout=60)
      if r.status_code == 429:
        wait_time = 30 * (attempt + 1)
        print(f"  [OSM Throttle] Rate limited, waiting {wait_time}s before retry...")
        time.sleep(wait_time)
        continue
      if r.status_code != 200:
        print(f"  [OSM Error]: {r.status_code} {r.text[:100]}")
        return []
      data = r.json()
      out = []
      for el in data.get("elements", []):
        name = el.get("tags", {}).get("name")
        if not name: continue
        out.append({ "raw_name": name, "raw_url": None, "raw_address": None, "raw_blob": el })
      return out
    except Exception as e:
      print(f"  [OSM Error]: {e}")
      time.sleep(15 * (attempt + 1))
  return []

def fetch_wikidata_detroit():
  endpoint = "https://query.wikidata.org/sparql"
  query = """
  PREFIX wdt: <http://www.wikidata.org/prop/direct/>
  PREFIX wd: <http://www.wikidata.org/entity/>
  PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
  SELECT ?item ?itemLabel ?street ?cityName ?postalCode ?website WHERE {
    VALUES ?class { wd:Q33506 wd:Q23002054 wd:Q43229 wd:Q28640 wd:Q173387 }
    ?item wdt:P31/wdt:P279* ?class ;
          wdt:P131* wd:Q239256 .
    OPTIONAL { ?item wdt:P969 ?street }
    OPTIONAL { ?item wdt:P281 ?postalCode }
    OPTIONAL { ?item wdt:P131 ?cityEntity . ?cityEntity rdfs:label ?cityName FILTER (LANG(?cityName) = "en") }
    OPTIONAL { ?item wdt:P856 ?website }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }
  LIMIT 500
  """
  headers_local = {
    "Accept": "application/sparql-results+json",
    "User-Agent": "CurioIngestionBot/1.0 (contact@curio.org)"
  }
  try:
    resp = requests.get(endpoint, params={"query": query}, headers=headers_local, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    out = []
    for row in data.get("results", {}).get("bindings", []):
      name = row.get("itemLabel", {}).get("value")
      if not name:
        continue
      street = row.get("street", {}).get("value", "")
      city = row.get("cityName", {}).get("value", "")
      postal = row.get("postalCode", {}).get("value", "")
      address_bits = [part for part in [street, city, postal] if part]
      web = row.get("website", {}).get("value")
      out.append({
        "raw_name": name,
        "raw_url": web,
        "raw_address": ", ".join(address_bits),
        "raw_blob": row
      })
    return out
  except Exception as e:
    print(f"  [Wikidata Error]: {e}")
    return []

# --- VALIDATION & DESCRIPTION BUILDERS ---

def validate_bucket(bucket_rows):
  names, addresses, websites, phones = {}, {}, {}, {}
  for r in bucket_rows:
    src, n, a, w, p = r.get("source_code","?"), (r.get("raw_name") or "").strip(), (r.get("raw_address") or "").strip(), (r.get("raw_url") or "").strip(), ""
    rb = r.get("raw_blob") or {}
    if "details" in rb and rb["details"]:
      if rb["details"].get("website"): w = rb["details"]["website"]
      if rb["details"].get("formatted_phone_number"): p = rb["details"]["formatted_phone_number"]
    
    if n: names.setdefault(n, []).append(src)
    if a: addresses.setdefault(a, []).append(src)
    if w: websites.setdefault(w, []).append(src)
    if p: phones.setdefault(p, []).append(src)
  
  def pick_best(d: dict):
    if not d: return None, 0
    best_val, best_count = None, -1
    for val, srcs in d.items():
      if len(srcs) > best_count:
        best_val, best_count = val, len(srcs)
    return best_val, best_count

  best_name, name_count = pick_best(names)
  best_address, addr_count = pick_best(addresses)
  best_website, web_count = pick_best(websites)
  best_phone, phone_count = pick_best(phones)
  
  flags, reasons = [], []
  if name_count == 0:
    flags.append("name-missing"); reasons.append("No name found")
  elif name_count == 1 and len(bucket_rows) > 1:
    flags.append("name-disagreement"); reasons.append("Sources disagree on name")
  if addr_count == 0:
    flags.append("no-address"); reasons.append("No address found")
  elif addr_count == 1 and len(bucket_rows) > 1:
    flags.append("address-disagreement"); reasons.append("Sources disagree on address")
  if web_count == 0:
    flags.append("no-website"); reasons.append("No website found")

  return {
    "best_name": best_name, "best_address": best_address, "best_website": best_website, "best_phone": best_phone,
    "name_agreement": name_count, "address_agreement": addr_count, "website_agreement": web_count,
    "flags": flags, "reasons": reasons
  }

def build_institution_description(bucket_rows, city="Detroit"):
  for r in bucket_rows:
    rb = r.get("raw_blob", {})
    details = rb.get("details")
    if details and details.get("editorial_summary") and details["editorial_summary"].get("overview"):
      return details["editorial_summary"]["overview"].strip()
  for r in bucket_rows:
    if r.get("source_code") == "tripadvisor-detroit":
      rb = r.get("raw_blob", {})
      ta_desc = rb.get("description") or rb.get("overview")
      if ta_desc: return ta_desc.strip()
  for r in bucket_rows:
    if r.get("source_code") == "yelp-detroit-museums":
      rb = r.get("raw_blob", {})
      if rb.get("categories") and r.get("raw_name"):
        cats = [c["title"] for c in rb.get("categories", []) if "title" in c]
        if cats: return f"{r['raw_name']} is a {cats[0].lower()} in {city}."
  name = bucket_rows[0].get("raw_name", "This site")
  return f"{name} is a public-facing cultural site in {city}. This entry was auto-generated and will be updated when the institution claims its Curio page."

def normalize_short_description(text: str, max_len: int = 300) -> str:
  if not text: return ""
  text = text.strip()
  if len(text) <= max_len: return text
  truncated = text[:max_len]
  last_space = truncated.rfind(" ")
  if last_space > 50:
    truncated = truncated[:last_space]
  return truncated + "..."

def merge_bucket(bucket_rows, validation_results):
  merged = {
    "name": validation_results["best_name"],
    "website_url": validation_results["best_website"],
    "address": { "street": validation_results["best_address"], "city": "Detroit", "state": "MI", "country": "US" },
    "phone": validation_results["best_phone"],
    "lat": None, "lng": None, "opening_hours": None, "sources_used": []
  }
  rows_sorted = sorted(bucket_rows, key=lambda r: SOURCE_PRIORITY.index(r.get("source_code", "?")) if r.get("source_code", "?") in SOURCE_PRIORITY else 99)
  for r in rows_sorted:
    merged["sources_used"].append(r.get("source_code"))
    rb = r.get("raw_blob", {})
    if not merged["lat"]:
      if "details" in rb and rb["details"] and rb["details"].get("geometry"):
        loc = rb["details"]["geometry"].get("location", {})
        merged["lat"], merged["lng"] = loc.get("lat"), loc.get("lng")
    if not merged["lat"]:
      if "coordinates" in rb:
        merged["lat"], merged["lng"] = rb["coordinates"].get("latitude"), rb["coordinates"].get("longitude")
    if not merged["lat"]:
      if rb.get("lat") and rb.get("lon"):
        merged["lat"], merged["lng"] = rb.get("lat"), rb.get("lon")
    if not merged["opening_hours"]:
      if "details" in rb and rb["details"] and rb["details"].get("opening_hours"):
        merged["opening_hours"] = rb["details"]["opening_hours"]
  return merged
```

Keep this cell near the top of your notebook so you can re-run it quickly if the environment resets.

---

## 7. Scrape & Persist Raw Rows

This is where the ingestion actually happens. In a **new Colab code cell**, paste the script below and run it top-to-bottom. The cell does two things: (1) wipes any old Detroit rows from `public.ingested_institutions_raw` so you are not duplicating data, and (2) calls each fetcher (Yelp, Google, TripAdvisor, OSM, Wikidata) to repopulate the table with fresh payloads.

> ⚠️ **Before you run this cell:** export a backup of `public.ingested_institutions_raw` if you want to preserve previous runs. In Supabase: Table Editor → `ingested_institutions_raw` → **Export data** → save the CSV. The script below deletes every row for the selected source codes before inserting fresh data.

```python
# 0. (One-time per run) Clear existing raw rows for this city’s sources so we don’t duplicate records.
source_codes = [s["code"] for s in sources]
print("Resetting raw rows for:", ", ".join(source_codes))
for code in source_codes:
  delete_resp = requests.delete(
    f"{SUPABASE_URL}/rest/v1/ingested_institutions_raw?source_code=eq.{code}",
    headers=headers
  )
  if delete_resp.status_code not in (200, 204):
    print(f"  [Warning] Could not delete rows for {code}: {delete_resp.status_code} {delete_resp.text[:80]}")

# Optional: confirm the table is empty for this city before scraping again
remaining = 0
for code in source_codes:
  check_resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/ingested_institutions_raw?source_code=eq.{code}&select=id",
    headers=headers
  )
  remaining += len(check_resp.json())
print("Rows remaining after reset:", remaining)
if remaining != 0:
  print("Rows still exist for this city. Scroll back to this same cell and click Run again to repeat the delete.")
  print("If the number is still not zero, open Supabase → Table Editor → ingested_institutions_raw, filter by each source_code,")
  print("and manually delete leftover rows before you continue.")

# 1. Fresh scrape
raw_count = 0
for src in sources:
  code = src["code"]
  print(f"Scraping: {code}")
  items = []
  
  if code == "yelp-detroit-museums":
    items = fetch_yelp_detroit()
  elif code == "google-places-detroit":
    items = []
    for place_type in ["museum", "tourist_attraction", "art_gallery", "park"]:
      print(f"  ...fetching Google type: {place_type}")
      results = fetch_google_places_detroit(place_type)
      print(f"     → pulled {len(results)} rows for {place_type}")
      items.extend(results)
  elif code == "tripadvisor-detroit":
    items = fetch_tripadvisor_detroit()
  elif code == "osm-detroit":
    items = fetch_osm_detroit()
  elif code == "wikidata-detroit":
    items = fetch_wikidata_detroit()
  
  for item in items:
    payload = {
      "source_id": src["id"],
      "source_code": code,
      "raw_name": item.get("raw_name"),
      "raw_url": item.get("raw_url"),
      "raw_address": item.get("raw_address"),
      "raw_blob": item.get("raw_blob") or {}
    }
    r = requests.post(
      f"{SUPABASE_URL}/rest/v1/ingested_institutions_raw",
      headers=headers,
      json=payload
    )
    if r.status_code != 201:
        print(f"  [Supabase Error] Failed to write {item.get('raw_name')}: {r.status_code} {r.text[:100]}")
  
  print(f"  Wrote {len(items)} items from {code}")
  raw_count += len(items)

print(f"Total raw rows inserted: {raw_count}")
```

Verify the Supabase table now holds the raw rows from all four sources.

How to check inside Supabase:
1. In the left navigation, open **Table editor** and choose the `public.ingested_institutions_raw` table.
2. Use the filter bar at the top of the grid to set `source_code = yelp-detroit-museums`. Check the row count shown above the grid. Repeat for the other source codes (`google-places-detroit`, `tripadvisor-detroit`, `osm-detroit`, `wikidata-detroit`). Each count should roughly match the console output printed in Colab for that source.
3. Clear all filters and confirm the total number of rows matches the `raw_count` total from the previous cell.

Why this matters: Step 8 only processes rows that already exist in `ingested_institutions_raw`. If a fetcher failed silently, you’ll catch it here and can rerun the affected source before moving on.

> Google Places returns 20 records per page (maximum ~60 per place type). The helper now follows `next_page_token` pointers with the required 2-second delay so nothing is missed. If you still need more coverage, expand the `place_type` list or increase the `radius` and rerun this step.
>
> **Heads-up:** the delete step above removes all previous raw rows for the listed source codes. If you need an archival copy, export the table before running this script.

---

## 8. Push Cleaned Candidates to Google Sheets

With raw rows in Supabase, the next step is to prep them for human review. Add a **new Colab code cell**, paste the block below, and run it once per ingestion cycle. The script:

1. Downloads every row from `public.ingested_institutions_raw` (1,000 at a time so Colab stays stable).
2. Groups potential duplicates into “buckets” via normalized names and addresses.
3. Runs the validation helper to produce `FLAG` / `FLAG_REASON` values.
4. Builds a dataframe with reviewer-friendly columns and creates a timestamped worksheet in Google Sheets.

```python
print("Fetching all raw rows from Supabase (1,000 at a time)...")
raw_all = []
chunk_size = 1000
start = 0

while True:
  ranged_headers = dict(headers)
  ranged_headers["Range"] = f"{start}-{start + chunk_size - 1}"
  resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/ingested_institutions_raw?select=*",
    headers=ranged_headers
  )
  batch = resp.json()
  raw_all.extend(batch)
  print(f"  Retrieved rows {start}-{start + len(batch) - 1}")
  if len(batch) < chunk_size:
    break
  start += chunk_size

print(f"Fetched {len(raw_all)} total raw rows.")

buckets = defaultdict(list)
for r in raw_all:
  nm = (r.get("raw_name") or "").strip()
  if not nm: continue
  key = normalize_name(nm)
  buckets[key].append(r)
print(f"Grouped into {len(buckets)} unique institutions.")

# Second-pass dedupe: merge buckets that share the same cleaned address
address_groups = {}
merged_buckets = {}
for norm_name, bucket_rows in buckets.items():
  canonical = norm_name
  for row in bucket_rows:
    addr_key = normalize_address_key(row.get("raw_address") or "")
    if addr_key and addr_key in address_groups:
      canonical = address_groups[addr_key]
      break
  merged_buckets.setdefault(canonical, [])
  merged_buckets[canonical].extend(bucket_rows)
  for row in bucket_rows:
    addr_key = normalize_address_key(row.get("raw_address") or "")
    if addr_key:
      address_groups[addr_key] = canonical

buckets = merged_buckets
print(f"Buckets after address merge: {len(buckets)}")

rows_for_sheet = []
for norm_name, bucket_rows in buckets.items():
  v = validate_bucket(bucket_rows)
  display_row = clean_row_for_sheet(bucket_rows[0])
  flag_value = "OK" if len(v["flags"]) == 0 else ",".join(v["flags"])
  flag_reason = "" if len(v["reasons"]) == 0 else " | ".join(v["reasons"])
  
  rows_for_sheet.append({
    "bucket_key": norm_name,
    "FLAG": flag_value,
    "FLAG_REASON": flag_reason,
    "id": display_row.get("id"),
    "source_code": display_row.get("source_code"),
    "raw_name": v["best_name"] or display_row.get("raw_name"),
    "raw_address": v["best_address"] or display_row.get("raw_address"),
    "raw_url": v["best_website"] or display_row.get("raw_url"),
    "KEEP": "",
    "REASON": "",
    "city": CITY_TITLE
  })

df_new = pd.DataFrame(rows_for_sheet)

from datetime import datetime
today_str = datetime.utcnow().strftime("%Y-%m-%d")
base_title = f"{CITY_TITLE} - {today_str}"
existing_titles = [ws.title for ws in sh.worksheets()]
worksheet_title = base_title
suffix = 1
while worksheet_title in existing_titles:
  suffix += 1
  worksheet_title = f"{base_title} ({suffix})"

rows_needed = max(len(df_new) + 10, 1000)
worksheet = sh.add_worksheet(title=worksheet_title, rows=rows_needed, cols=20)

set_with_dataframe(worksheet, df_new)
print(f"Created worksheet '{worksheet_title}' with {len(df_new)} candidate institutions.")
print("Review here:", sh.url)
```

When it finishes, switch to Sheets, open the brand-new tab (e.g., `Detroit – 2025-11-08`), and confirm the columns match the order listed below. If the sheet is empty or missing `bucket_key`, rerun the cell—the importer is idempotent and safe to re-run.

Your new worksheet (e.g., `Detroit – 2025-11-08`) now includes:
- A hidden-but-critical `bucket_key` column that ties each sheet row to the normalized institution name.
- Auto-cleaned `raw_name`, `raw_address`, `raw_url`
- `FLAG` / `FLAG_REASON` columns to prioritize reviews
- Empty `KEEP` / `REASON` fields for human input

> Supabase REST enforces a 1,000-row default window. The chunking loop above advances the `Range` header automatically so every raw row reaches Sheets, even for very large metros.
>
> Because each run creates a timestamped tab, older review states stay intact for auditing. Feel free to hide the `bucket_key` column in the sheet if you find it visually noisy—just don’t delete it.

Immediately after the Colab cell finishes, switch to the new Google Sheet tab and confirm the columns look like this (left to right):
1. Column A = `bucket_key`
2. Column B = `FLAG`
3. Column C = `FLAG_REASON`
4. Column D = `id`
5. Column E = `source_code`
6. Column F = `raw_name`
7. Column G = `raw_address`
8. Column H = `raw_url`
9. Column I = `KEEP`
10. Column J = `REASON`
11. Column K = `city`

If Column A does not show `bucket_key`, unhide the leftmost column (instructions below) before anyone edits the sheet.

### 8.1 If `bucket_key` Goes Missing

1. In Google Sheets, click the column header between `FLAG` and `id`. If you see a small double line, right-click → **Unhide column** to reveal `bucket_key`.
2. If the column was overwritten, rerun Step 8 in Colab. The script rebuilds `bucket_key` from `raw_name` automatically, but you will need to re-enter any `KEEP` decisions you made while the column was corrupted.
3. To prevent future mistakes, right-click the `bucket_key` header → **Protect range** → set permission to “Only you.” Reviewers can still hide/unhide, but Sheets will warn them before editing.

---

## 9. Human-In-The-Loop Review

Inside the Google Sheet:

1. **Sort/Filter by `FLAG`** to handle issues first (`no-website`, `address-disagreement`, etc.).
2. **Investigate flagged rows** (Google search, official websites) and update `raw_*` columns directly in Sheets if needed.
3. **Approve records** by typing `YES` in the `KEEP` column.
4. **Reject records** by leaving `KEEP` blank or writing `NO`.
5. Optionally add context in the `REASON` column for future reference.

Sheets auto-saves, so there is no export step. All reviewers collaborate here.

### 9.1 Reviewer Quick-Start (First-Time Setup)

If this is your first time reviewing Curio ingestion data, do the following before editing any rows:

1. **Freeze the header row** – In Google Sheets, click `View → Freeze → 1 row` so the column labels stay visible while you scroll.
2. **Enable filters** – Press `Ctrl + Shift + L` (or click `Data → Create a filter`) so you can quickly filter by `FLAG` or `KEEP`.
3. **Skim the `FLAG_REASON` legend** – Read the first 5–10 rows to understand the kinds of issues the validator surfaces (missing website, name disagreement, etc.).
4. **Review checklist** – For every row you plan to keep:
   - Confirm the institution is cultural (not a coffee shop or unrelated venue).
   - Confirm the URL points to an official or authoritative site.
   - Fix casing/typos directly in `raw_name`, `raw_address`, or `raw_url` if needed.
   - Type `YES` in `KEEP` only after the row looks ready for Supabase.
5. **Escalate uncertain cases** – Add a short note in the `REASON` column (e.g., “unsure if still open”) so another reviewer or an admin can follow up.
6. **Leave `bucket_key` alone** – You can hide the column if you want, but do not delete or overwrite it. The automation depends on `bucket_key` to keep your `KEEP/REASON` decisions when new data is merged in.

You can optionally record a 2–3 minute Loom video walking through a single approval; paste that link in cell `J1` as a reminder for future reviewers.

---

## 10. Pull Approved Rows Back into Colab

Once reviewers finish their pass, you have to bring the `KEEP=YES` rows back into Python. Add a **new Colab code cell** with the snippet below and run it. The cell reads the Google Sheet, filters for `KEEP=YES`, and rebuilds a list of buckets that are ready for merging.

```python
reviewed_df = get_as_dataframe(worksheet, evaluate_formulas=True)
reviewed_df = reviewed_df.dropna(subset=["raw_name"], how="any")
keep_df = reviewed_df[reviewed_df["KEEP"].str.upper() == "YES"].copy()
print(f"Rows marked KEEP=YES: {len(keep_df)}")
```

Rebuild the normalized buckets and keep only those approved in the sheet:

```python
kept_norm_names = set(keep_df['raw_name'].apply(normalize_name))

final_buckets_to_merge = {}
for norm_name, bucket_rows in buckets.items():
  if norm_name in kept_norm_names:
    final_buckets_to_merge[norm_name] = bucket_rows

print(f"Found {len(final_buckets_to_merge)} final institutions to merge and upsert.")
```

---

## 11. Merge, Describe, Upsert, and Link

Time to turn those approved buckets into real Curio institutions. Create a **new Colab cell**, paste the block below, and run it. The script loops through every `final_buckets_to_merge` entry, builds the best-guess profile (name/address/description), upserts it into `public.institutions`, and records provenance rows in `public.institution_source_links`. Watch the console output—each upsert prints its status so you can fix issues immediately.

```python
verified_slugs = []

for norm_name, rows in final_buckets_to_merge.items():
  validation = validate_bucket(rows)
  merged = merge_bucket(rows, validation)
  raw_short_desc = build_institution_description(rows, CITY_TITLE)
  short_desc = normalize_short_description(raw_short_desc, max_len=300)

  final_name = validation["best_name"] or merged["name"] or norm_name.title()
  slug = slugify(f"{final_name}-{CITY}")

  inst_payload = {
    "name": final_name,
    "slug": slug,
    "plan": "public",
    "is_claimed": False,
    "source_system": "ingested-open-data",
    "source_record_id": norm_name,
    "auto_payload": {**merged, "validation": validation},
    "auto_confidence": 0.9 if len(validation["flags"]) == 0 else 0.6,
    "short_description": short_desc,
    "long_description": None
  }

  upsert_headers = dict(headers)
  upsert_headers["Prefer"] = "resolution=merge-duplicates"
  
  r = requests.post(
    f"{SUPABASE_URL}/rest/v1/institutions?on_conflict=slug",
    headers=upsert_headers,
    json=inst_payload
  )
  print(f"UPSERT: {final_name} (Status: {r.status_code})")
  if r.status_code not in [200, 201]:
      print(f"  [Supabase Error] {r.text}")
      continue

  r_get = requests.get(f"{SUPABASE_URL}/rest/v1/institutions?slug=eq.{slug}", headers=headers)
  inst_data = r_get.json()
  if not inst_data:
    print(f"  [Link Error] Could not fetch {slug} after upsert.")
    continue
  inst_id = inst_data[0]["id"]
  verified_slugs.append(slug)
  
  for raw_row in rows:
    link_payload = {
      "institution_id": inst_id,
      "raw_id": raw_row["id"],
      "source_code": raw_row.get("source_code")
    }
    link_headers = dict(headers)
    link_headers["Prefer"] = "resolution=ignore-duplicates"
    r_link = requests.post(
      f"{SUPABASE_URL}/rest/v1/institution_source_links?on_conflict=institution_id,raw_id",
      headers=link_headers,
      json=link_payload
    )
```

Outcome checklist once the cell finishes:
- `public.institutions` now contains merged, de-duplicated entries with short descriptions.
- `public.institution_source_links` ties each institution to all contributing raw rows for provenance.
- `auto_payload` stores the merged data and validation details for debugging or reprocessing.

### 11.1 Verify the Final Rows

Before moving on to another city, confirm each merged institution actually landed in Supabase with a valid short description:

1. Stay in the same Colab session and run the snippet below; it iterates over every slug captured in `verified_slugs` and fetches the fresh row from Supabase.
2. Watch the console output:
   - `[Verify] Missing record for {slug}` means the upsert failed. Open **Table editor → public.institutions**, filter by that slug, and rerun the merge block for the affected bucket until the row appears.
   - `[Verify] Short description issue…` indicates the description is blank or longer than 300 characters. Fix the input data in the Google Sheet (or adjust the short-description helper), rerun the merge for that bucket, and re-run this verification cell so the warning clears.
3. After the script reports success, open **Table editor → public.institution_source_links**, filter by an `institution_id` you just created, and confirm one link exists for each raw source row. This quick provenance check ensures downstream analytics can trace every institution back to its source data.

Only proceed once every slug passes these checks.

```python
print("Verifying Supabase inserts...")
for slug in verified_slugs:
  resp = requests.get(f"{SUPABASE_URL}/rest/v1/institutions?slug=eq.{slug}", headers=headers)
  data = resp.json()
  if not data:
    print(f"  [Verify] Missing record for {slug}")
    continue
  record = data[0]
  short_desc = record.get("short_description") or ""
  if not short_desc or len(short_desc) > 300:
    print(f"  [Verify] Short description issue on {slug} ({len(short_desc)} chars)")
  else:
    print(f"  [Verify] {slug} looks good ({len(short_desc)} chars)")
```

Slugs are the URL-friendly IDs for each institution (`detroit-institute-of-arts-detroit`, etc.). Copy the final verification output (or the `verified_slugs` list) into your project notes so you have a record of what was inserted in this run and which source links you checked.

To copy the output from Colab: click inside the output cell, drag to highlight the text, press `Cmd+C` (macOS) or `Ctrl+C` (Windows), then paste (`Cmd+V` / `Ctrl+V`) into your notes tool (Notion, Google Doc, etc.). If you prefer, click the three dots in the top-right of the output cell → **Copy to clipboard**.

If any record fails verification, fix the data (e.g., update Sheets, rerun the affected bucket) before proceeding to the next city.

---

## 12. Running the Pipeline for a New City

Detroit acts as the reference run, but nothing in this pipeline is city-specific. When you expand to Chicago, Toronto, or any other metro, follow the checklist below so every prerequisite (Supabase rows, Sheets tab, Colab constants) is in place before you rerun Sections 5–11. Use it as a mini runbook for onboarding teammates—each bullet points back to the detailed instructions earlier in this document.

1. **Supabase Sources** — duplicate the `ingestion_sources` seed with city-specific codes (e.g., `yelp-chicago-museums`). Include the correct parser + API endpoint.
2. **City constant** — update the Colab cell:
   ```python
   CITY = "chicago"
   CITY_TITLE = CITY.title()
   ```
3. **Google Sheet Tab** — add a worksheet named `Chicago` inside **Curio – Ingestion Review** so reviewers have a dedicated tab.
4. **Rerun from §5.7 onward** — confirm sources, scrape raw data, push to Sheets, review, and merge.
5. **Repeat for each city** — Chicago, Toronto, Winnipeg, Minneapolis, etc. Keep the same notebook; just rerun the cells for the updated city constant.

---

## 13. Operational Notes & Safety Checks

- **Secrets Hygiene** — keep Supabase and API keys in a secure notes vault or Colab secrets, never in git.
- **Rate Limits** — Google Places Nearby Search may require pagination for >20 results; the current radius + types combination typically surfaces hundreds of Detroit listings.
- **TripAdvisor Access** — approval can take time; the scripts tolerate missing keys by logging and skipping.
- **Supabase RLS** — once ingestion is stable, write explicit Row Level Security policies before exposing the tables beyond trusted notebooks.
- **Audit Trail** — `auto_payload.validation.flags` mirrors the Google Sheet `FLAG` column so downstream systems can understand ingestion confidence.
- **Short Description Logic** — priority is Google editorial summary → TripAdvisor description → Yelp category sentence → fallback copy referencing the city; every description is capped at 300 characters while preserving whole words.

---

## 14. Ongoing Monitoring

1. **Google Places quotas** — Each API key has a daily quota. If the helper starts returning `OVER_QUERY_LIMIT`, pause for the day or enable billing alerts inside Google Cloud Console.
2. **Supabase storage** — The raw ingestion table grows quickly. Periodically archive old raw rows to cold storage (after they are linked) to stay within the free-tier 500 MB limit.
3. **TripAdvisor follow-ups** — Keep a calendar reminder to rerun Step 7 for TripAdvisor whenever a new key or expanded radius becomes available.
4. **OSM courtesy** — Respect Overpass etiquette: avoid running more than one city simultaneously and keep the exponential backoff enabled.
5. **Reviewer rotations** — Schedule at least two reviewers per city so the `KEEP` decisions stay unbiased and culturally sensitive.
6. **Audit trail snapshots** — After each ingestion, export the Google Sheet tab to PDF (File → Download → PDF) and store it in your project folder. This preserves the human review state if questions arise later.

---

## Phase 2 Enhancements (Planned)

1. **Automated ingestion runs** — Promote the Colab flow to a scheduled workflow (GitHub Actions or n8n) so each city refreshes automatically (e.g., every Sunday at 3 AM) with proper logging and alerts.
2. **AI assist on flagged rows** — Introduce an AI rewrite/check that only triggers when `validation.flags` is non-empty, reducing human cleanup time without wasting tokens.
3. **Official website crawler** — After the pipeline is stable, fetch meta descriptions/hero images from each institution’s own site to enrich public listings.
4. **Expanded Google Places coverage** — Continue iterating on the paginated fetch (new place types, larger radii, scheduled reruns) to capture edge-case venues once Phase 1 is rock solid.

## Future Enhancements (Post-Phase 2)

1. **Local + civic data feeds** — Add Detroit/CultureSource open-data sources to `ingestion_sources` to better represent community archives and municipally run sites.
2. **External website verifier** — Schedule a separate job that re-checks `website_url` fields (and fixes broken ones) after the ingestion pipeline has run.
3. **Top-level `city` column** — Extend `public.institutions` so `city` is stored alongside `name` and `slug`, simplifying `/city/<slug>` queries and analytics exports.

---

With these steps—and awareness of the current gaps—anyone on the team (or an approved AI agent) can ingest a new market end-to-end without prior context. Follow the order exactly, keep the Google Sheet review diligent, and review Supabase records after each run to preserve Curio’s data quality bar.
