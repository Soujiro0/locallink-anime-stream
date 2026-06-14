import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import AnimeGrid from "../components/anime/AnimeGrid";
import Dropdown from "../components/ui/Dropdown";
import Pagination from "../components/ui/Pagination";
import { searchAnime } from "../services/api";
import { GENRES, FORMATS, STATUSES, SORT_OPTIONS } from "../utils/constants";

export default function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  // Filter state from URL params
  const filters = {
    genre: searchParams.get("genre") || "",
    format: searchParams.get("format") || "",
    status: searchParams.get("status") || "",
    sort: searchParams.get("sort") || "",
  };

  const updateFilter = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
    setPage(1);
  };

  useEffect(() => {
    if (!query.trim()) return;

    let cancelled = false;
    setLoading(true);

    searchAnime(query, page, {
      genre: filters.genre,
      format: filters.format,
      status: filters.status,
      sort: filters.sort,
    })
      .then((data) => {
        if (!cancelled) {
          setResults(data.results || []);
          setHasNext(data.hasNextPage || false);
        }
      })
      .catch((err) => {
        console.error("Search error:", err);
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [query, page, filters.genre, filters.format, filters.status, filters.sort]);

  return (
    <div id="search-results-page" className="pt-24 px-5 lg:px-24 pb-16 min-h-screen">
      <h1 className="text-3xl lg:text-4xl font-black text-text-primary mb-2">
        Search Results
      </h1>
      {query && (
        <p className="text-text-secondary mb-6">
          Showing results for "<span className="text-text-primary font-medium">{query}</span>"
        </p>
      )}

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 p-4 bg-surface-base rounded-xl border border-surface-border">
        <Dropdown
          label="Genre"
          value={filters.genre}
          options={GENRES}
          onChange={(v) => updateFilter("genre", v)}
        />
        <Dropdown
          label="Format"
          value={filters.format}
          options={FORMATS}
          onChange={(v) => updateFilter("format", v)}
        />
        <Dropdown
          label="Status"
          value={filters.status}
          options={STATUSES}
          onChange={(v) => updateFilter("status", v)}
        />
        <Dropdown
          label="Sort By"
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={(v) => updateFilter("sort", v)}
        />
      </div>

      <AnimeGrid
        anime={results}
        loading={loading}
        emptyMessage={query ? "No anime found for this search." : "Enter a search query to find anime."}
      />

      {/* Pagination */}
      {!loading && results.length > 0 && (
        <Pagination
          page={page}
          hasNext={hasNext}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
