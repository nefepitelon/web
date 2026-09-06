"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ResearchArchiveFiltersProps = {
  query: string;
  category: string;
  sort: string;
  resultCount: number;
  categories: Array<{ name: string; count: number }>;
};

const sortOptions = [
  ["newest", "最新发布"],
  ["popular", "热度最高"],
  ["quick", "快速阅读"],
  ["deep", "深度长读"],
  ["oldest", "最早发布"]
] as const;

export function ResearchArchiveFilters({ query, category, sort, resultCount, categories }: ResearchArchiveFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serializedParams = searchParams.toString();
  const [searchValue, setSearchValue] = useState(query);

  const updateParams = useCallback((values: Record<string, string>) => {
    const next = new URLSearchParams(serializedParams);
    next.delete("edit");
    next.delete("unpublished");
    next.delete("error");
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}#research-archive`, { scroll: false });
  }, [pathname, router, serializedParams]);

  useEffect(() => {
    if (searchValue === query) return;
    const timeout = window.setTimeout(() => updateParams({ q: searchValue.trim() }), 320);
    return () => window.clearTimeout(timeout);
  }, [searchValue, query, updateParams]);

  const totalCount = categories.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="research-archive-controls">
      <div className="research-filter-primary">
        <label className="research-search-box">
          <Search aria-hidden="true" />
          <span className="sr-only">搜索研究文章</span>
          <input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="搜索标题、摘要或分类…" />
          {searchValue ? <button type="button" onClick={() => setSearchValue("")} aria-label="清空搜索">×</button> : null}
        </label>
        <div className="research-category-tabs" aria-label="研究分类">
          <button type="button" className={!category ? "is-active" : ""} onClick={() => updateParams({ category: "" })}>全部 <span>{totalCount}</span></button>
          {categories.map((item) => (
            <button key={item.name} type="button" className={category === item.name ? "is-active" : ""} onClick={() => updateParams({ category: item.name })}>
              {item.name} <span>{item.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="research-filter-secondary">
        <label className="research-sort-select">
          <SlidersHorizontal aria-hidden="true" />
          <span className="sr-only">文章排序</span>
          <select value={sort} onChange={(event) => updateParams({ sort: event.target.value })}>
            {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <p>找到 <strong>{resultCount}</strong> 篇研究{query ? <span> · “{query}”</span> : null}</p>
      </div>
    </div>
  );
}
