# AirIndex compliance position

Problem statement SIH26056 · Ministry of Statistics and Programme Implementation

This is the document to read before enabling any live source, and the document to present
first if anyone asks how the data is obtained.

---

## 1. The position in one paragraph

The problem statement asks for an airfare index built through automated web scraping of
airline and aggregator portals. Those portals prohibit automated fare extraction in their
terms of service and block it in practice. A system whose only mode of operation is to do
the prohibited thing is not deliverable to a ministry. AirIndex is therefore built so that
the scraper is one interchangeable source among several, the compliance gate sits above all
of them where no adapter can reach around it, and the default demonstration path uses data
that requires no one's permission. The index method, which is the part a statistical office
would actually adopt, is fully exercised either way.

---

## 2. Controls, and where they live in the code

| Control | Implementation | Behaviour |
|---|---|---|
| robots.txt gate | `backend/collector/robots.py` | Checked per source per run. **Fails closed**: unreachable, unparseable or error-returning robots.txt blocks collection |
| Gate placement | `backend/collector/runner.py` | Runs before any adapter is called. An adapter cannot skip a check it never sees |
| Live adapter flag | `COLLECTOR_LIVE_ADAPTERS_ENABLED` | Off by default. Checked twice, at adapter construction and at run time |
| Rate limiting | `backend/collector/throttle.py` | Token bucket per domain, no bursting, honours any `Crawl-delay` |
| Request budget | `backend/collector/throttle.py` | Hard per-run ceiling. A bug costs one aborted run, not a day of traffic |
| Identification | `COLLECTOR_USER_AGENT` | Descriptive user agent carrying a contact address |
| Audit trail | `crawl_runs` table | Every run recorded, including blocked and failed ones |

The gate is verified by test: `tests/integration/test_pipeline_and_api.py` asserts that an
unreachable robots.txt returns a refusal, that a blocked source still writes a crawl-run
row, and that the live adapters are excluded from `resolve_adapters` unless the flag is set.

---

## 3. What the system will not do

These are absent from the codebase by design, not merely disabled.

- No CAPTCHA solving, and no integration with a CAPTCHA-solving service.
- No evasion of bot detection: no browser fingerprint spoofing, no residential proxy
  rotation, no header randomisation to impersonate a consumer browser.
- No authentication walls are crossed. Nothing that requires a login is read.
- No personal data is collected at any point. Fares, routes, dates and carriers only.
- No bypass of any rate limit a site advertises or enforces.

If a portal blocks collection, the correct response in this project is to record the block
and stop, which is what the code does.

---

## 4. Terms of service review

**Status: not completed for any live portal. No live adapter is enabled.**

Each row below must be filled in by a named person before the corresponding adapter is
turned on. An empty decision column means the adapter stays off.

| Source | Adapter | robots.txt | Terms of service | Reviewed by | Date | Decision |
|---|---|---|---|---|---|---|
| IndiGo | `collector/adapters/live_portal.py` | Not yet checked | `goindigo.in` terms and conditions | — | — | **Not reviewed. Disabled.** |
| Air India | same | Not yet checked | `airindia.com` legal terms | — | — | **Not reviewed. Disabled.** |
| MakeMyTrip | same | Not yet checked | `makemytrip.com` user agreement | — | — | **Not reviewed. Disabled.** |
| Licensed feed | `collector/adapters/feed.py` | Not applicable | Governed by the supply agreement | — | — | Enabled when configured |
| Synthetic | `collector/adapters/synthetic.py` | Not applicable | Not applicable | Team VisionX | 2026-09-19 | **Enabled.** Generates its own data |

An honest expectation about how that review will go: for the aggregator portals in
particular, the terms prohibit automated extraction in plain language, and the correct
outcome of the review is to leave the adapter off and pursue a licensed feed instead. The
adapter code exists as structure, with selectors deliberately left undefined, so that the
review is a precondition rather than an afterthought.

---

## 5. Why the default source is synthetic

Three reasons, in order of how much they matter.

**It is defensible.** Nothing about generating data requires anyone's permission. A jury
from a ministry can ask any question about how the data was obtained and the answer is
short.

**It is reliable.** A demonstration that depends on a commercial bot-management system
choosing not to block it is a demonstration that fails at an unpredictable moment, quite
possibly during judging.

**It exercises everything.** The generator deliberately injects sold-out cells, promotional
fares, currency mix-ups, zero-price layout glitches and fares an order of magnitude out. The
validation rules, the outlier rule, the imputation path and the coverage threshold all fire
on real inputs. A pipeline tested only on clean data is not a tested pipeline.

What it is not: real market prices. Every value it produces is labelled synthetic in the
database, in the API, on the dashboard, and in the analyst's first sentence. It caps the
data trust score at a level that cannot reach "publishable", by design, so that a
demonstration can never present itself as a measurement.

---

## 6. The route to production data

In descending order of preference.

1. **A licensed feed.** A commercial or partner fare feed accessed under an agreement. No
   compliance surface, stable schema, no rate-limit fight. `LicensedFeedAdapter` is generic:
   point it at any JSON endpoint and describe the field mapping in the environment.
2. **Direct airline agreements.** A statistical office asking carriers for fare data under a
   statistical-purposes agreement is a better instrument than any scraper, and MoSPI is in a
   position to ask in a way this team is not.
3. **Portals that permit it.** Where robots.txt and the terms allow automated access, the
   gate opens by itself and the adapter runs.
4. **Scraping a portal that prohibits it.** Not a route. Not implemented.

---

## 7. Data protection

No personal data is collected, stored or processed. The observation record holds a route, a
departure date, a capture timestamp, a carrier code, a flight number, a cabin and a price.
There is no passenger, no search session, no device identifier and no user.

No personal or sensitive value is ever placed in a URL or a query string. API keys are
stored as SHA-256 digests and compared in constant time. The development keys shipped in
settings are refused outright whenever the environment is not `development`, so a
deployment that forgets to change them fails closed rather than running wide open.

---

## 8. Contact

Replace `COLLECTOR_USER_AGENT` with a real, monitored contact address before this system
makes a single request to anyone else's servers. A crawler that cannot be contacted is a
crawler that will be blocked, and rightly so.
