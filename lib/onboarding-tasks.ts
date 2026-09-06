export const onboardingTasks = [
  {
    key: "explore_research",
    title: "阅读一篇链上研究",
    description: "从研究档案了解周期、资金流与链上结构。",
    href: "/research",
    category: "研究"
  },
  {
    key: "explore_alpha_radar",
    title: "打开 Alpha Radar",
    description: "认识异动排行、信号解释和实时情报流。",
    href: "/alpha-radar",
    category: "信号"
  },
  {
    key: "explore_dashboard",
    title: "查看链上看板",
    description: "切换趋势指标并理解当前 BTC 周期位置。",
    href: "/dashboard",
    category: "数据"
  },
  {
    key: "explore_grid_ops",
    title: "体验 AI 网格交易 Ops",
    description: "了解策略生成、风险检查与执行工作流。",
    href: "/grid-ops",
    category: "执行"
  },
  {
    key: "explore_toolbox",
    title: "浏览百宝箱",
    description: "收藏一个常用工具，建立自己的工作台。",
    href: "/toolbox",
    category: "工具"
  }
] as const;

export type OnboardingTaskKey = typeof onboardingTasks[number]["key"];
export const onboardingTaskDefinitions = onboardingTasks;
export const requiredGuideTaskKeys = onboardingTasks.map((task) => task.key);

export function isOnboardingTaskKey(value: string): value is OnboardingTaskKey {
  return onboardingTasks.some((task) => task.key === value);
}
