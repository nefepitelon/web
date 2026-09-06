import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Columns3,
  LayoutGrid,
  Globe2,
  Landmark,
  Layers3,
  Search,
  Sparkles,
  Table2,
  Trophy,
  UsersRound,
  RadioTower,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BINANCE_INFLUENCE_DETAILS_SOURCE } from "@/lib/binance-square-influence-details";
import {
  BINANCE_INFLUENCE_SNAPSHOT,
  binanceInfluenceAccounts,
  binanceInfluenceCategories,
  binanceInfluenceFollowerTotal,
  binanceInfluenceOriginalSource,
  binanceInfluenceSources,
  type BinanceInfluenceAccount,
  type BinanceInfluenceCategory,
} from "@/lib/binance-square-influence";
import { getBinanceSquareSnapshot } from "@/lib/binance-square-radar";
import type { SquareRadarSnapshot } from "@/lib/binance-square-radar-types";
import {
  easySeasons,
  getEasyProjectLinks,
  historicalPeople,
  historyRankingSource,
  totalEasyProjects,
  type EasyProject,
  type HistoricalPerson,
} from "@/lib/rankings";
import { getViewer } from "@/lib/membership";
import { BinanceSquareMonitor } from "./binance-square-monitor";
import styles from "./rankings.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "奇录排行榜",
  description: "welinkBTC 站内永久榜单档案：历史人物、YZi Labs EASY Residency 项目、币安广场主播监控与影响力 Top100。",
};

type RankingPageProps = {
  searchParams: Promise<{
    board?: string | string[];
    q?: string | string[];
    field?: string | string[];
    season?: string | string[];
    category?: string | string[];
    view?: string | string[];
  }>;
};

type RankingView = "table" | "cards" | "board";
type RankingBoard = "history" | "easy" | "square" | "influence";

const historyFields: readonly HistoricalPerson["field"][] = [
  "宗教与思想",
  "科学与技术",
  "政治与制度",
  "医学与生命",
  "文化与艺术",
  "探索与交流",
  "经济与社会",
];

const rankingViews: readonly RankingView[] = ["table", "cards", "board"];

const projectCategoryRules = [
  { label: "稳定币与支付", keywords: ["稳定币", "支付", "跨境", "入金", "外汇", "fx", "清算"] },
  { label: "AI 与智能体", keywords: ["ai", "agent", "智能体", "大模型", "模型", "智能"] },
  { label: "交易与市场", keywords: ["交易", "市场", "做市", "amm", "预测", "杠杆", "期权", "衍生品", "mev", "主经纪商"] },
  { label: "金融与资产", keywords: ["借贷", "rwa", "资产", "股票", "黄金", "etf", "基金", "金融", "保证金", "pre-ipo", "预言机"] },
  { label: "数据与基础设施", keywords: ["链上", "基础设施", "数据", "depin", "协议", "身份", "api", "发行"] },
  { label: "合规与安全", keywords: ["合规", "kyc", "隐私", "安全", "税务", "会计", "碳信用"] },
  { label: "机器人与科研", keywords: ["机器人", "科研", "医疗", "健康", "基因", "药物", "农业", "手语"] },
  { label: "内容与消费", keywords: ["视频", "音乐", "家教", "创作者", "社交", "游戏", "收藏品", "消费"] },
] as const;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getRankingView(value: string): RankingView {
  return rankingViews.includes(value as RankingView) ? (value as RankingView) : "table";
}

function getProjectCategory(name: string, direction: string) {
  const text = `${name} ${direction}`.toLocaleLowerCase("zh-CN");
  return projectCategoryRules.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)))?.label ?? "其他创新";
}

function rankingsHref(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return `/rankings${params.size ? `?${params}` : ""}#ranking-content`;
}

function SourceLink({ label, url }: { label: string; url: string }) {
  return (
    <a className={styles.sourceLink} href={url} target="_blank" rel="noopener noreferrer">
      <span>{label}</span>
      <ArrowUpRight aria-hidden="true" />
    </a>
  );
}

function ViewSwitcher({
  active,
  params,
}: {
  active: RankingView;
  params: Record<string, string | number | undefined>;
}) {
  const views = [
    { value: "table" as const, label: "表格展示", icon: Table2 },
    { value: "cards" as const, label: "卡片展示", icon: LayoutGrid },
    { value: "board" as const, label: "分类看板", icon: Columns3 },
  ];

  return (
    <div className={styles.viewToolbar}>
      <div>
        <small>DISPLAY MODE</small>
        <strong>{views.find((item) => item.value === active)?.label}</strong>
      </div>
      <nav className={styles.viewSwitcher} aria-label="榜单展示视图">
        {views.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              className={active === item.value ? styles.activeView : ""}
              href={rankingsHref({ ...params, view: item.value })}
              key={item.value}
              prefetch={false}
              title={item.label}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function BoardDirectory({ active, view, squareSnapshot }: { active: RankingBoard; view: RankingView; squareSnapshot: SquareRadarSnapshot }) {
  return (
    <section className={styles.directory} aria-label="榜单目录">
      <div className={styles.sectionHeading}>
        <div>
          <span>RANKING INDEX · 04</span>
          <h2>选择一个榜单开始探索</h2>
        </div>
        <p>每个榜单拥有独立数据模型、来源记录与更新节奏，后续可持续扩展。</p>
      </div>
      <div className={styles.directoryGrid}>
        <Link className={`${styles.boardCard} ${active === "history" ? styles.activeBoard : ""}`} href={rankingsHref({ board: "history", view })} prefetch={false}>
          <span className={styles.boardNumber}>01</span>
          <span className={styles.boardIcon}><Landmark aria-hidden="true" /></span>
          <span className={styles.boardCopy}>
            <small>HISTORY · PEOPLE</small>
            <strong>影响人类历史进程的100名人</strong>
            <em>100 位 · 7 个领域 · 修订版序列</em>
          </span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
        <Link className={`${styles.boardCard} ${active === "easy" ? styles.activeBoard : ""}`} href={rankingsHref({ board: "easy", season: 4, view })} prefetch={false}>
          <span className={styles.boardNumber}>02</span>
          <span className={styles.boardIcon}><Layers3 aria-hidden="true" /></span>
          <span className={styles.boardCopy}>
            <small>VENTURE · INCUBATION</small>
            <strong>YZi Labs / EASY Residency 项目榜</strong>
            <em>{totalEasyProjects} 个项目 · 4 季 · 方向与状态档案</em>
          </span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
        <Link className={`${styles.boardCard} ${active === "square" ? styles.activeBoard : ""}`} href={rankingsHref({ board: "square" })} prefetch={false}>
          <span className={styles.boardNumber}>03</span>
          <span className={styles.boardIcon}><RadioTower aria-hidden="true" /></span>
          <span className={styles.boardCopy}>
            <small>LIVE · CREATOR RADAR</small>
            <strong>币安广场主播监控榜</strong>
            <em>{squareSnapshot.dashboard.totalCreators || squareSnapshot.creators.length} 位主播 · {squareSnapshot.dashboard.liveCount} 位直播中 · 实时同步</em>
          </span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
        <Link className={`${styles.boardCard} ${active === "influence" ? styles.activeBoard : ""}`} href={rankingsHref({ board: "influence", view })} prefetch={false}>
          <span className={styles.boardNumber}>04</span>
          <span className={styles.boardIcon}><TrendingUp aria-hidden="true" /></span>
          <span className={styles.boardCopy}>
            <small>SNAPSHOT · INFLUENCE MAP</small>
            <strong>币安广场影响力排名 Top100</strong>
            <em>100 个账号 · 6 类角色 · 2026-05-23 快照</em>
          </span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function ProjectStatus({ status }: { status: EasyProject["status"] }) {
  return status
    ? <em className={styles.statusBadge} data-status={status}>{status}</em>
    : <small className={styles.statusBadge}>已归档</small>;
}

function ProjectLink({ href, label, project }: { href?: string; label: "X" | "官网"; project: string }) {
  if (!href) return <span className={styles.unverifiedLink}>待核验</span>;

  return (
    <a
      aria-label={`${project} ${label}`}
      className={styles.projectLink}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span>{label}</span>
      <ArrowUpRight aria-hidden="true" />
    </a>
  );
}

function ProjectLinks({ project, season }: { project: EasyProject; season: number }) {
  const links = getEasyProjectLinks(season, project.rank);
  return (
    <div className={styles.projectLinks}>
      <ProjectLink href={links.x} label="X" project={project.name} />
      <ProjectLink href={links.website} label="官网" project={project.name} />
    </div>
  );
}

function HistoryResults({ people, view }: { people: readonly HistoricalPerson[]; view: RankingView }) {
  if (view === "table") {
    return (
      <div className={styles.tableViewport}>
        <table className={`${styles.rankingTable} ${styles.historyTable}`}>
          <caption className={styles.visuallyHidden}>影响人类历史进程的100名人紧凑表格</caption>
          <thead>
            <tr><th>排名</th><th>人物</th><th>所属国家／地区</th><th>领域</th><th>时代</th><th>影响摘要</th></tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.rank}>
                <td className={styles.tableRank}>{String(person.rank).padStart(3, "0")}</td>
                <td className={styles.tableName}>{person.name}</td>
                <td className={styles.countryCell}>{person.country}</td>
                <td><span className={styles.tableTag}>{person.field}</span></td>
                <td>{person.era}</td>
                <td className={styles.tableDescription}>{person.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view === "cards") {
    return (
      <div className={styles.recordCardGrid}>
        {people.map((person) => (
          <article className={styles.recordCard} key={person.rank}>
            <div className={styles.recordTopline}>
              <span>{String(person.rank).padStart(3, "0")}</span>
              <small>{person.field}</small>
            </div>
            <h3>{person.name}</h3>
            <div className={styles.recordMeta}><em>{person.era}</em><span>{person.country}</span></div>
            <p>{person.impact}</p>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.categoryBoard}>
      {historyFields.map((field) => {
        const fieldPeople = people.filter((person) => person.field === field);
        if (!fieldPeople.length) return null;
        return (
          <section className={styles.categoryColumn} key={field}>
            <header><span>{field}</span><strong>{fieldPeople.length}</strong></header>
            <div className={styles.categoryItems}>
              {fieldPeople.map((person) => (
                <article className={styles.categoryItem} key={person.rank}>
                  <span>{String(person.rank).padStart(3, "0")}</span>
                  <div><h3>{person.name}</h3><small>{person.era} · {person.country}</small></div>
                  <p>{person.impact}</p>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EasyResults({ projects, season, view }: { projects: readonly EasyProject[]; season: number; view: RankingView }) {
  if (view === "table") {
    return (
      <div className={styles.tableViewport}>
        <table className={`${styles.rankingTable} ${styles.projectTable}`}>
          <caption className={styles.visuallyHidden}>EASY Residency Season {season} 项目紧凑表格</caption>
          <thead>
            <tr><th>序号</th><th>项目</th><th>赛道方向</th><th>分类</th><th>状态</th><th>X／推特</th><th>官网</th></tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={`${season}-${project.rank}`}>
                <td className={styles.tableRank}>{String(project.rank).padStart(2, "0")}</td>
                <td className={styles.tableName}>{project.name}</td>
                <td className={styles.tableDescription}>{project.direction}</td>
                <td><span className={styles.tableTag}>{getProjectCategory(project.name, project.direction)}</span></td>
                <td><ProjectStatus status={project.status} /></td>
                <td><ProjectLink href={getEasyProjectLinks(season, project.rank).x} label="X" project={project.name} /></td>
                <td><ProjectLink href={getEasyProjectLinks(season, project.rank).website} label="官网" project={project.name} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view === "cards") {
    return (
      <div className={styles.projectGrid}>
        {projects.map((project) => (
          <article className={styles.projectCard} key={`${season}-${project.rank}`}>
            <div className={styles.projectTopline}>
              <span>{String(project.rank).padStart(2, "0")}</span>
              <ProjectStatus status={project.status} />
            </div>
            <h3>{project.name}</h3>
            <p>{project.direction}</p>
            <ProjectLinks project={project} season={season} />
            <div className={styles.projectFooter}>
              <span>EASY S{season} · {getProjectCategory(project.name, project.direction)}</span>
              <Sparkles aria-hidden="true" />
            </div>
          </article>
        ))}
      </div>
    );
  }

  const categoryOrder = [...projectCategoryRules.map((rule) => rule.label), "其他创新"];
  return (
    <div className={styles.categoryBoard}>
      {categoryOrder.map((category) => {
        const categoryProjects = projects.filter((project) => getProjectCategory(project.name, project.direction) === category);
        if (!categoryProjects.length) return null;
        return (
          <section className={styles.categoryColumn} key={category}>
            <header><span>{category}</span><strong>{categoryProjects.length}</strong></header>
            <div className={styles.categoryItems}>
              {categoryProjects.map((project) => (
                <article className={styles.categoryItem} key={`${season}-${project.rank}`}>
                  <span>{String(project.rank).padStart(2, "0")}</span>
                  <div><h3>{project.name}</h3><ProjectStatus status={project.status} /></div>
                  <p>{project.direction}</p>
                  <ProjectLinks project={project} season={season} />
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function HistoryRanking({ query, field, view }: { query: string; field: string; view: RankingView }) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const activeField = historyFields.includes(field as HistoricalPerson["field"])
    ? (field as HistoricalPerson["field"])
    : "";
  const visiblePeople = historicalPeople.filter((person) => {
    const matchesField = !activeField || person.field === activeField;
    const haystack = `${person.rank} ${person.name} ${person.country} ${person.field} ${person.era} ${person.impact}`.toLocaleLowerCase("zh-CN");
    return matchesField && (!normalizedQuery || haystack.includes(normalizedQuery));
  });

  return (
    <section className={styles.rankingPanel} id="ranking-content">
      <header className={styles.rankingHeader}>
        <div>
          <span className={styles.eyebrow}>BOARD 01 · PERMANENT ARCHIVE</span>
          <h2>影响人类历史进程的100名人排行榜</h2>
          <p>迈克尔·H·哈特榜单的 1992 年修订版站内结构化档案。排名反映原作者的影响力观点，不代表本站价值判断。</p>
        </div>
        <div className={styles.rankingMetrics}>
          <span><strong>100</strong><small>人物</small></span>
          <span><strong>7</strong><small>领域</small></span>
          <span><strong>1992</strong><small>修订版</small></span>
        </div>
      </header>

      <ViewSwitcher active={view} params={{ board: "history", field: activeField, q: query }} />

      <div className={styles.controls}>
        <form className={styles.searchForm} action="/rankings" method="get">
          <input type="hidden" name="board" value="history" />
          <input type="hidden" name="view" value={view} />
          {activeField ? <input type="hidden" name="field" value={activeField} /> : null}
          <Search aria-hidden="true" />
          <label htmlFor="history-search">搜索人物、领域或影响</label>
          <input id="history-search" name="q" defaultValue={query} placeholder="例如：牛顿、医学、工业革命" />
          <button type="submit">搜索</button>
        </form>
        <nav className={styles.filterPills} aria-label="人物领域筛选">
          <Link className={!activeField ? styles.activePill : ""} href={rankingsHref({ board: "history", q: query, view })} prefetch={false}>全部 <span>100</span></Link>
          {historyFields.map((item) => {
            const count = historicalPeople.filter((person) => person.field === item).length;
            return (
              <Link className={activeField === item ? styles.activePill : ""} href={rankingsHref({ board: "history", field: item, q: query, view })} key={item} prefetch={false}>
                {item} <span>{count}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={styles.resultsBar}>
        <span>RANKED RECORDS</span>
        <p>当前展示 <strong>{visiblePeople.length}</strong> / 100 条{query ? <> · “{query}”</> : null}</p>
      </div>

      {visiblePeople.length ? (
        <HistoryResults people={visiblePeople} view={view} />
      ) : (
        <div className={styles.emptyState}><Search aria-hidden="true" /><strong>没有找到匹配人物</strong><p>尝试清空关键词或切换领域。</p></div>
      )}

      <footer className={styles.sourceNote}>
        <BookOpen aria-hidden="true" />
        <div>
          <strong>来源与编辑说明</strong>
          <p>排名与人名顺序依据中文维基百科所列修订版；人物影响说明由本站重新概括。所属国家／地区采用人物活动时代的政治实体并附现代常用地理对应，不等同于现代公民国籍。争议人物的收录仅用于还原原榜单。</p>
          <SourceLink label={historyRankingSource.label} url={historyRankingSource.url} />
        </div>
      </footer>
    </section>
  );
}

function EasyRanking({ query, seasonNumber, view }: { query: string; seasonNumber: number; view: RankingView }) {
  const selectedSeason = easySeasons.find((season) => season.season === seasonNumber) ?? easySeasons.at(-1)!;
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const projects = selectedSeason.projects.filter((project) => {
    const links = getEasyProjectLinks(selectedSeason.season, project.rank);
    const haystack = `${project.rank} ${project.name} ${project.direction} ${project.status ?? ""} ${links.website ?? ""} ${links.x ?? ""}`.toLocaleLowerCase("zh-CN");
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });
  const monitoredCount = selectedSeason.projects.filter((project) => project.status === "持续关注").length;

  return (
    <section className={`${styles.rankingPanel} ${styles.easyPanel}`} id="ranking-content">
      <header className={styles.rankingHeader}>
        <div>
          <span className={styles.eyebrow}>BOARD 02 · INCUBATION RADAR</span>
          <h2>YZi Labs / EASY Residency 孵化项目榜</h2>
          <p>按 Season 沉淀项目名称、赛道方向与站内观察状态。首批收录依据所提供资料图，并以 YZi Labs 官方项目页交叉核对。</p>
        </div>
        <div className={styles.rankingMetrics}>
          <span><strong>{totalEasyProjects}</strong><small>首批收录</small></span>
          <span><strong>4</strong><small>Seasons</small></span>
          <span><strong>{monitoredCount}</strong><small>本季关注</small></span>
        </div>
      </header>

      <ViewSwitcher active={view} params={{ board: "easy", season: selectedSeason.season, q: query }} />

      <nav className={styles.seasonTabs} aria-label="EASY Residency 季度">
        {easySeasons.map((season) => (
          <Link className={selectedSeason.season === season.season ? styles.activeSeason : ""} href={rankingsHref({ board: "easy", season: season.season, view })} key={season.season} prefetch={false}>
            <span>S{season.season}</span>
            <strong>Season {season.season}</strong>
            <small>{season.projects.length} projects</small>
          </Link>
        ))}
      </nav>

      <div className={styles.seasonSummary}>
        <div><CalendarDays aria-hidden="true" /><span><small>PERIOD</small><strong>{selectedSeason.period}</strong></span></div>
        <div><Globe2 aria-hidden="true" /><span><small>LOCATION</small><strong>{selectedSeason.location}</strong></span></div>
        <div><Trophy aria-hidden="true" /><span><small>DEMO DAY</small><strong>{selectedSeason.demoDay}</strong></span></div>
        <div><UsersRound aria-hidden="true" /><span><small>ARCHIVED</small><strong>{selectedSeason.projects.length} projects</strong></span></div>
      </div>

      <div className={styles.controls}>
        <form className={styles.searchForm} action="/rankings" method="get">
          <input type="hidden" name="board" value="easy" />
          <input type="hidden" name="season" value={selectedSeason.season} />
          <input type="hidden" name="view" value={view} />
          <Search aria-hidden="true" />
          <label htmlFor="easy-search">搜索项目或赛道方向</label>
          <input id="easy-search" name="q" defaultValue={query} placeholder="例如：稳定币、AI Agent、RWA" />
          <button type="submit">搜索</button>
        </form>
      </div>

      <div className={styles.resultsBar}>
        <span>SEASON {selectedSeason.season} PROJECTS</span>
        <p>当前展示 <strong>{projects.length}</strong> / {selectedSeason.projects.length} 个项目</p>
      </div>

      {projects.length ? (
        <EasyResults projects={projects} season={selectedSeason.season} view={view} />
      ) : (
        <div className={styles.emptyState}><Search aria-hidden="true" /><strong>没有找到匹配项目</strong><p>尝试搜索其他项目名称或赛道。</p></div>
      )}

      <footer className={styles.sourceNote}>
        <Archive aria-hidden="true" />
        <div>
          <strong>档案口径</strong>
          <p>本页项目数按 Season 1—4 资料图首批收录，并以 YZi Labs 官方 cohort 资料、项目官网及官方社交入口交叉核验。无法可靠区分同名项目时显示“待核验”，不猜测跳转地址；官方活动页在不同发布时间可能采用不同 cohort 统计口径。状态标签为站内观察字段，不构成投资建议。</p>
          <SourceLink label={selectedSeason.source.label} url={selectedSeason.source.url} />
        </div>
      </footer>
    </section>
  );
}

const compactNumber = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const fullNumber = new Intl.NumberFormat("zh-CN");

function InfluenceProfileLink({ account }: { account: BinanceInfluenceAccount }) {
  if (!account.profileUrl) return <span className={styles.unverifiedLink}>待核验</span>;

  return (
    <a
      aria-label={`打开 ${account.name} 的币安广场主页`}
      className={styles.profileLink}
      href={account.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span>打开主页</span>
      <ArrowUpRight aria-hidden="true" />
    </a>
  );
}

function InfluenceResults({ accounts, view }: { accounts: readonly BinanceInfluenceAccount[]; view: RankingView }) {
  if (view === "table") {
    return (
      <div className={styles.tableViewport}>
        <table className={`${styles.rankingTable} ${styles.influenceTable}`}>
          <caption className={styles.visuallyHidden}>币安广场影响力排名 Top100 紧凑表格</caption>
          <thead>
            <tr><th>排名</th><th>账号</th><th>站内分类</th><th>KOL 粉丝数</th><th>总粉丝数</th><th>个人说明</th><th>跳转主页</th></tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.rank}>
                <td className={styles.tableRank}>{String(account.rank).padStart(3, "0")}</td>
                <td className={styles.tableName}>{account.name}</td>
                <td><span className={styles.tableTag}>{account.category}</span></td>
                <td className={styles.metricCell}>{fullNumber.format(account.kolFollowers)}</td>
                <td className={styles.metricCell}>{fullNumber.format(account.followers)}</td>
                <td className={styles.influenceBioCell}>{account.bio || "Google 表格暂未提供说明"}</td>
                <td><InfluenceProfileLink account={account} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view === "cards") {
    return (
      <div className={styles.recordCardGrid}>
        {accounts.map((account) => (
          <article className={`${styles.recordCard} ${styles.influenceCard}`} key={account.rank}>
            <div className={styles.recordTopline}>
              <span>{String(account.rank).padStart(3, "0")}</span>
              <small>KOL {fullNumber.format(account.kolFollowers)}</small>
            </div>
            <h3>{account.name}</h3>
            <div className={styles.recordMeta}><em>{account.category}</em></div>
            <p className={styles.influenceBio}>{account.bio || "Google 表格暂未提供个人说明。"}</p>
            <dl className={styles.influenceStats}>
              <div><dt>KOL 粉丝数</dt><dd>{fullNumber.format(account.kolFollowers)}</dd></div>
              <div><dt>总粉丝数</dt><dd>{fullNumber.format(account.followers)}</dd></div>
            </dl>
            <InfluenceProfileLink account={account} />
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.categoryBoard}>
      {binanceInfluenceCategories.map((category) => {
        const categoryAccounts = accounts.filter((account) => account.category === category);
        if (!categoryAccounts.length) return null;
        return (
          <section className={styles.categoryColumn} key={category}>
            <header><span>{category}</span><strong>{categoryAccounts.length}</strong></header>
            <div className={styles.categoryItems}>
              {categoryAccounts.map((account) => (
                <article className={styles.categoryItem} key={account.rank}>
                  <span>{String(account.rank).padStart(3, "0")}</span>
                  <div><h3>{account.name}</h3><small>KOL {fullNumber.format(account.kolFollowers)} · 总粉丝 {compactNumber.format(account.followers)}</small></div>
                  <p>{account.bio || "Google 表格暂未提供个人说明。"}</p>
                  <InfluenceProfileLink account={account} />
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function InfluenceRanking({ query, category, view }: { query: string; category: string; view: RankingView }) {
  const activeCategory = binanceInfluenceCategories.includes(category as BinanceInfluenceCategory)
    ? (category as BinanceInfluenceCategory)
    : "";
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleAccounts = binanceInfluenceAccounts.filter((account) => {
    const matchesCategory = !activeCategory || account.category === activeCategory;
    const haystack = `${account.rank} ${account.name} ${account.category} ${account.kolFollowers} ${account.followers} ${account.bio}`.toLocaleLowerCase("zh-CN");
    return matchesCategory && (!normalizedQuery || haystack.includes(normalizedQuery));
  });

  return (
    <section className={`${styles.rankingPanel} ${styles.influencePanel}`} id="ranking-content">
      <header className={styles.rankingHeader}>
        <div>
          <span className={styles.eyebrow}>BOARD 04 · SNAPSHOT INFLUENCE MAP</span>
          <h2>币安广场影响力排名 Top100</h2>
          <p>将两篇公开文章的 1—100 名整理为站内可检索榜单，保留原始排名、“KOL 粉丝数”与“粉丝数”字段；站内分类用于阅读导航，不改变原榜顺序。</p>
        </div>
        <div className={styles.rankingMetrics}>
          <span><strong>100</strong><small>收录账号</small></span>
          <span><strong>6</strong><small>站内分类</small></span>
          <span><strong>05·23</strong><small>2026 快照</small></span>
        </div>
      </header>

      <ViewSwitcher active={view} params={{ board: "influence", category: activeCategory, q: query }} />

      <div className={styles.influenceSummary}>
        <div><TrendingUp aria-hidden="true" /><span><small>TOP KOL REACH</small><strong>245</strong></span></div>
        <div><UsersRound aria-hidden="true" /><span><small>RECORDED FOLLOWERS</small><strong>{compactNumber.format(binanceInfluenceFollowerTotal)}</strong></span></div>
        <div><BookOpen aria-hidden="true" /><span><small>SOURCE PARTS</small><strong>2 篇</strong></span></div>
      </div>

      <div className={styles.controls}>
        <form className={styles.searchForm} action="/rankings" method="get">
          <input type="hidden" name="board" value="influence" />
          <input type="hidden" name="view" value={view} />
          {activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
          <Search aria-hidden="true" />
          <label htmlFor="influence-search">搜索账号、排名或分类</label>
          <input id="influence-search" name="q" defaultValue={query} placeholder="例如：万联、Binance、研究与数据" />
          <button type="submit">搜索</button>
        </form>
        <nav className={styles.filterPills} aria-label="影响力账号分类筛选">
          <Link className={!activeCategory ? styles.activePill : ""} href={rankingsHref({ board: "influence", q: query, view })} prefetch={false}>全部 <span>100</span></Link>
          {binanceInfluenceCategories.map((item) => {
            const count = binanceInfluenceAccounts.filter((account) => account.category === item).length;
            return (
              <Link className={activeCategory === item ? styles.activePill : ""} href={rankingsHref({ board: "influence", category: item, q: query, view })} key={item} prefetch={false}>
                {item} <span>{count}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={styles.resultsBar}>
        <span>INFLUENCE RECORDS</span>
        <p>当前展示 <strong>{visibleAccounts.length}</strong> / 100 个账号{query ? <> · “{query}”</> : null}</p>
      </div>

      {visibleAccounts.length ? (
        <InfluenceResults accounts={visibleAccounts} view={view} />
      ) : (
        <div className={styles.emptyState}><Search aria-hidden="true" /><strong>没有找到匹配账号</strong><p>尝试清空关键词或切换分类。</p></div>
      )}

      <footer className={styles.sourceNote}>
        <BookOpen aria-hidden="true" />
        <div>
          <strong>来源、快照与编辑口径</strong>
          <p>排名及两项粉丝数据来自币安广场上下篇所引用的 XHunt 中文社区完整榜单，数据快照为 {BINANCE_INFLUENCE_SNAPSHOT}，并非实时统计。个人说明和主页链接按用户提供的 Google 表格及后续补充信息匹配，现已覆盖全部 100 个账号。站内分类为便于浏览的编辑归类，不构成投资建议。</p>
          <div className={styles.sourceLinks}>
            <SourceLink label="个人说明与主页匹配表" url={BINANCE_INFLUENCE_DETAILS_SOURCE} />
            {binanceInfluenceSources.map((source) => <SourceLink key={source.part} label={source.label} url={source.url} />)}
            <SourceLink label={binanceInfluenceOriginalSource.label} url={binanceInfluenceOriginalSource.url} />
          </div>
        </div>
      </footer>
    </section>
  );
}

function SquareRanking({ snapshot }: { snapshot: SquareRadarSnapshot }) {
  return (
    <section className={`${styles.rankingPanel} ${styles.squarePanel}`} id="ranking-content">
      <header className={styles.rankingHeader}>
        <div>
          <span className={styles.eyebrow}>BOARD 03 · REAL-TIME CREATOR RADAR</span>
          <h2>币安广场主播监控榜</h2>
          <p>聚合币安广场公开主播与直播数据，支持主播搜索、本机关注、精选与分类筛选、多指标排序、币种标签及直播入口。页面每 30 秒自动更新，切到后台时暂停轮询。</p>
        </div>
        <div className={styles.rankingMetrics}>
          <span><strong>{snapshot.dashboard.totalCreators || snapshot.creators.length}</strong><small>收录主播</small></span>
          <span><strong>{snapshot.dashboard.liveCount}</strong><small>正在直播</small></span>
          <span><strong>{snapshot.categories.length}</strong><small>内容分类</small></span>
        </div>
      </header>

      <BinanceSquareMonitor initialSnapshot={snapshot} />

      <footer className={styles.sourceNote}>
        <RadioTower aria-hidden="true" />
        <div>
          <strong>实时数据与使用说明</strong>
          <p>本榜经站内服务端从公开监控源读取并完成字段白名单校验、链接域名限制与失败快照降级；关注状态仅存于当前浏览器。实时在线、观看和互动数可能因上游刷新节奏存在短暂延迟，仅用于信息观察，不代表币安官方背书，也不构成投资建议。</p>
          <SourceLink label="币安广场主播监控公开数据源" url={snapshot.source} />
        </div>
      </footer>
    </section>
  );
}

export default async function RankingsPage({ searchParams }: RankingPageProps) {
  const [viewer, params, squareSnapshot] = await Promise.all([getViewer(), searchParams, getBinanceSquareSnapshot()]);
  const requestedBoard = scalar(params.board);
  const activeBoard: RankingBoard = requestedBoard === "easy" || requestedBoard === "square" || requestedBoard === "influence"
    ? requestedBoard
    : "history";
  const query = scalar(params.q).trim().slice(0, 80);
  const field = scalar(params.field).trim().slice(0, 30);
  const category = scalar(params.category).trim().slice(0, 30);
  const seasonNumber = Number.parseInt(scalar(params.season), 10);
  const view = getRankingView(scalar(params.view));

  return (
    <AppShell viewer={viewer}>
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <span className={styles.heroBadge}><Trophy aria-hidden="true" /> CURATED RANKING ARCHIVE</span>
            <p className={styles.kicker}>WELINKBTC · 奇录</p>
            <h1>记录值得被<br /><span>长期看见</span>的次序。</h1>
            <p className={styles.heroLead}>从改变文明进程的人物，到仍在构建未来的早期项目。奇录排行榜把分散资料整理为可检索、可追溯、可持续扩展的站内档案。</p>
          </div>
          <div className={styles.heroStats}>
            <article><strong>04</strong><span>站内榜单</span><small>档案、快照与实时雷达</small></article>
            <article><strong>{historicalPeople.length + totalEasyProjects + squareSnapshot.creators.length + binanceInfluenceAccounts.length}</strong><span>结构化条目</span><small>人物 + 项目 + 主播 + 账号</small></article>
            <article><strong>{squareSnapshot.dashboard.liveCount}</strong><span>实时直播</span><small>当前公开监控</small></article>
          </div>
          <div className={styles.heroSeal} aria-hidden="true"><span>奇</span><small>QI LU</small></div>
        </section>

        <BoardDirectory active={activeBoard} squareSnapshot={squareSnapshot} view={view} />
        {activeBoard === "history" ? <HistoryRanking query={query} field={field} view={view} /> : null}
        {activeBoard === "easy" ? <EasyRanking query={query} seasonNumber={Number.isFinite(seasonNumber) ? seasonNumber : 4} view={view} /> : null}
        {activeBoard === "square" ? <SquareRanking snapshot={squareSnapshot} /> : null}
        {activeBoard === "influence" ? <InfluenceRanking category={category} query={query} view={view} /> : null}
      </main>
    </AppShell>
  );
}
