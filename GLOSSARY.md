# GLOSSARY

Architecture vocabulary for Xplora. Use these words exactly — they are the
shared language for reading and changing this codebase. Consistency here is
what makes the system navigable: a reader can tell, from the word alone, which
kind of thing they are looking at.

## The vocabulary

- **module** — a unit of code with an *interface* and an *implementation*. Not
  "component", "service" or "unit".
- **interface** — everything a caller must know to use a module: the surface
  it exposes. The interface is the test surface: it is what a test substitutes
  and what a caller depends on. Not "API" or "signature".
- **implementation** — the code behind the interface that does the work. Its
  complexity should be hidden from callers.
- **depth** — how much complexity a module hides behind a small interface. A
  *deep* module has a small interface and a large implementation; it gives
  *leverage* because one interface serves many call sites. A *shallow* module
  has an interface nearly as complex as its implementation — it adds
  indirection without concentrating complexity.
- **seam** — the place where two modules meet and a substitution could be made.
  One *adapter* at a seam is a hypothetical seam; two adapters make it real.
- **adapter** — a concrete thing plugged into a seam (an in-process source, a
  mock, a real backend). Adapters are what a test swaps.
- **leverage** — the payoff of a deep module: one interface, N call sites.
- **locality** — the property that a change or a bug is concentrated in one
  module rather than scattered across call sites.

## Working rules

- **The deletion test**: "would deleting this module *concentrate* complexity,
  or just *move* it?" A "yes, it concentrates" is the signal that a module is
  worth deepening. A pure re-export only *moves* complexity, so folding it into
  a larger module is the honest move.
- **The interface is the test surface**: prefer to put the decision logic
  *behind* a small interface, so a substitutable adapter (a candidate list, a
  fetcher, a source) is all a test needs. Extracting pure functions out of a
  workflow does not create a test surface when the bugs hide in *how callers
  call them* — that breaks locality.
- Depth is the goal, not more modules. Splitting a module into many shallow
  ones (each an interface ≈ its implementation) makes a system harder to read,
  not easier.

## Named deep modules

Concepts introduced by the deepening refactors. Each is one module that owns a
whole decision behind a small interface.

- **Recommendation session** (`backend/recommendation_session.py`) — owns the
  whole "produce and persist a recommendation session" decision: resolve model
  → retrieve RAG → analyze taste → generate → SSE framing → clamp → open
  session → persist → close. Interface: `stream_recommendations`,
  `stream_local_recommendations`, `stream_followup`, plus
  `retrieve_rag_context` and `save_recommendation_session` for the sync path.
  An optional injectable `source` is the mock seam. Routers are thin adapters.
  *Replaced 3 near-identical wrappers that reached into private methods.*

- **AIService facade** (`backend/ai_service/`) — the public interface to the AI
  feature mixins, now 5 deep mixins (`AIServiceBase`, `PromptMixin`,
  `TMDBMixin`, `PlaylistMixin`, `RecommendMixin`) instead of 8 shallow ones.
  Public method `analyze_user_taste` replaces the private
  `_analyze_user_taste` at the router seam; `TMDCMixin` is a backwards-compat
  alias of `TMDBMixin`. The genuinely deep `AIServiceBase._create_chat_retry`
  (resilience behind a small interface) is the contrast to protect.

- **media store** (`backend/media_store.py`) — one deep module owning per-user
  *read* queries behind a small interface (`get_preferences`, `get_profile`,
  `get_memories`, `count_media`, `list_all_media`, …). Routers depend on the
  interface, not on `db.exec(select(...))`. A single `resolve_db` in
  `backend/crud/_session.py` removes the triplicated session helper and the
  circular-import workaround in `deps.py`.

- **movie metadata** (`backend/movie_metadata.py`) — one deep module owning the
  resolve → fetch → normalize → poster → persist → reconcile → shape chain
  behind `resolve_title` and `enrich`. The `enrich` and `rematch` endpoints are
  thin adapters that differ only in how they resolve a `Match`. Injectable
  `search` / `fetch_detail` / `cache_poster` are the mock seam. Genre/country
  normalization has a public home in `backend/helpers.py`
  (`normalize_genre_str`, `normalize_country_str`), so no private normalizers
  leak across the seam.

- **external-source matching** (`backend/matching.py`) — one deep module owning
  normalization (CJK/pinyin/season/unicode/punctuation), scoring
  (`title_similarity`, `word_overlap_ratio`), the year boost and confidence
  threshold. Small interface: `best_match(query, candidates, year=None)` and
  `rank(query, candidates, titles=...)`. A substitutable `candidates` list is
  the mock seam, so the interface is the test surface.
  `backend/scraper/match.py` is now a thin compatibility re-export shim.

- **HTTP core** (`frontend/src/api/index.ts`) — one deep module owning base URL,
  token, HTML detection, the session-expiry 401 redirect, error parsing and SSE
  framing. Small public interface: `apiFetch`, `apiFetchResponse`,
  `streamEvents`. The 83 existing wrappers stay as thin adapters; call sites
  stop importing `API_BASE` and stop hand-rolling `fetch` / SSE readers.
  `redirectOn401:false` and `auth:false` are the opt-outs that keep login and
  first-run setup correct (a 401 there is not a session expiry).

## Modules worth protecting (already deep)

`backend/ssrf.py` (`validate_ssrf_target`), `backend/crypto.py`
(`encrypt_secret` / `decrypt_secret`), and `backend/ai_service/base.py`
(`_create_chat_retry`) — small interfaces hiding real complexity. Do not split
these into shallow modules.

## Notes

- There is no `docs/adr/` directory, so no ADR conflicts were recorded during
  these refactors. Domain terms for the RAG/profile subsystem come from
  `docs/DESIGN_RAG_USER_PROFILE.md`.
- There is no automated test suite in the repository; the *interface* is
  therefore the only test surface, which is why depth and locality matter here
  more than usual.
