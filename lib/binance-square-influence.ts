import { binanceInfluenceDetailsByRank } from "@/lib/binance-square-influence-details";

export const BINANCE_INFLUENCE_SNAPSHOT = "2026-05-23";

export const binanceInfluenceSources = [
  {
    part: 1,
    label: "币安广场影响力排名 Top100（上篇：1—50）",
    url: "https://app.binance.com/uni-qr/cart/327689933670801?l=zh-CN&r=RO493GFE&uc=web_square_share_link&uco=_VFCufWHFOIV6ADcMT4mEw&us=copylink",
  },
  {
    part: 2,
    label: "币安广场影响力排名 Top100（下篇：51—100）",
    url: "https://app.binance.com/uni-qr/cart/327696134287794?l=zh-CN&r=RO493GFE&uc=web_square_share_link&uco=_VFCufWHFOIV6ADcMT4mEw&us=copylink",
  },
] as const;

export const binanceInfluenceOriginalSource = {
  label: "XHunt 中文社区原始完整榜单",
  url: "https://x.com/XHuntCN/status/2059581779934409139",
} as const;

export const binanceInfluenceCategories = [
  "币安官方",
  "创始人与高管",
  "交易与策略",
  "研究与数据",
  "主播与社区",
  "Web3 生态",
] as const;

export type BinanceInfluenceCategory = (typeof binanceInfluenceCategories)[number];

export type BinanceInfluenceAccount = {
  rank: number;
  name: string;
  kolFollowers: number;
  followers: number;
  category: BinanceInfluenceCategory;
  sourcePart: 1 | 2;
  bio: string;
  profileUrl?: string;
};

type InfluenceFact = readonly [rank: number, name: string, kolFollowers: number, followers: number];

const influenceFacts: readonly InfluenceFact[] = [
  [1, "Yi He", 245, 2318163],
  [2, "CZ", 236, 1956914],
  [3, "币安广场", 219, 128232],
  [4, "颜驰Bit", 175, 166940],
  [5, "Binance Square Official", 167, 1383310],
  [6, "币安Binance华语", 164, 167533],
  [7, "Crypto交易员朱一旦", 157, 78427],
  [8, "Richard Teng", 153, 2194378],
  [9, "天晴ETH", 146, 92184],
  [10, "Binance Announcement", 136, 1905605],
  [11, "唐华斑竹", 135, 93521],
  [12, "Nuts坚果", 134, 84057],
  [13, "币毒", 126, 48243],
  [14, "新手学堂天使自治社区", 125, 37304],
  [15, "币安中文社区", 124, 70843],
  [16, "清风BNB", 124, 60320],
  [17, "财经悟空pro", 123, 80487],
  [18, "加密交易员鱼头", 118, 41029],
  [19, "无邪Infinity", 116, 54881],
  [20, "币圈王百一", 115, 100178],
  [21, "Binance News", 113, 2292241],
  [22, "乔帮主退休月球收租", 110, 37112],
  [23, "K线教主宝宝", 110, 45781],
  [24, "艾叔", 108, 100349],
  [25, "独领风骚必暴富", 108, 73838],
  [26, "Trend Coin", 105, 288562],
  [27, "Naccy小妹", 105, 86492],
  [28, "加密贝姐", 104, 75763],
  [29, "Anna-汤圆", 104, 77433],
  [30, "AB Kuai Dong", 103, 30874],
  [31, "交易员张张子", 103, 89311],
  [32, "大漠哥", 100, 34195],
  [33, "furan", 99, 60545],
  [34, "泵泵超人", 98, 39685],
  [35, "Btc星辰", 98, 82647],
  [36, "星期天-77", 98, 82524],
  [37, "Leo乘风", 97, 41391],
  [38, "BNSisi", 96, 4317],
  [39, "Pickle Cat", 95, 29268],
  [40, "黑哥BTC", 95, 60842],
  [41, "RiskSonder", 95, 46861],
  [42, "Van社长", 94, 40057],
  [43, "B哥复盘笔记", 92, 43154],
  [44, "老王Victor", 92, 43322],
  [45, "青蛙哥哥S", 92, 56778],
  [46, "三马哥", 91, 159100],
  [47, "婉宁公主", 91, 50267],
  [48, "K图先生", 90, 53874],
  [49, "投研看剑", 90, 64322],
  [50, "余烬Ember", 89, 138106],
  [51, "林克Clean", 89, 17004],
  [52, "杀破狼 WolfyXBT", 87, 26612],
  [53, "链研社lianyanshe", 87, 51082],
  [54, "厂长布林带之神", 87, 63750],
  [55, "Jeonlees", 87, 58942],
  [56, "暴走的加密博士", 84, 102678],
  [57, "南帝一灯大师", 84, 51710],
  [58, "熬鹰资本", 83, 57681],
  [59, "怀杨", 83, 49617],
  [60, "华子弟", 82, 57093],
  [61, "陈小艺", 82, 43953],
  [62, "Hawk自由哥", 82, 91664],
  [63, "交易员赵财神", 81, 89288],
  [64, "朱老师区块链", 80, 37639],
  [65, "生财王者", 80, 64329],
  [66, "欧吉巴克", 80, 48580],
  [67, "PhyrexNi", 79, 53579],
  [68, "乂一", 79, 31130],
  [69, "起愿", 79, 70367],
  [70, "KZG Crypto 口罩哥", 79, 66558],
  [71, "K线人生飞哥", 76, 58878],
  [72, "周周1688", 76, 76806],
  [73, "Justin Sun孙宇晨", 75, 96415],
  [74, "Luna春婷", 75, 62105],
  [75, "KastielLabs", 74, 72385],
  [76, "Henry厉飞雨", 74, 47577],
  [77, "超人不会飞2020", 73, 72016],
  [78, "IXOG 零号", 73, 75365],
  [79, "大表哥交易号", 72, 14160],
  [80, "飞鱼2026祝福版", 72, 68782],
  [81, "校长—1518学院", 72, 49446],
  [82, "机灵的杰尼君", 71, 33412],
  [83, "财经少华", 71, 37767],
  [84, "Kerwin1", 71, 37074],
  [85, "Eric SJ", 70, 54740],
  [86, "金先生聊MEME", 70, 64019],
  [87, "AH啊豪", 70, 48806],
  [88, "万联welinkBTC", 69, 51347],
  [89, "小鳄鱼 China", 69, 55164],
  [90, "沉默阿阳", 67, 33545],
  [91, "Binance BiBi", 67, 36412],
  [92, "FG峰哥论币", 67, 46911],
  [93, "肆月siyue", 67, 44270],
  [94, "黄粱一梦", 66, 40697],
  [95, "Niner 九儿", 66, 13412],
  [96, "芊羽Wing", 66, 33379],
  [97, "木匠Labs", 66, 37833],
  [98, "链上格格巫", 66, 51793],
  [99, "PATRICIA B-M", 66, 65349],
  [100, "Felix-是大飞呀", 66, 52222],
] as const;

const categoryRanks: Readonly<Record<BinanceInfluenceCategory, readonly number[]>> = {
  币安官方: [3, 5, 6, 10, 15, 21, 91],
  创始人与高管: [1, 2, 8, 73],
  研究与数据: [11, 30, 32, 33, 34, 37, 50, 53, 61, 64, 67, 70, 77, 82, 85, 92, 96, 97, 100],
  主播与社区: [14, 20, 27, 29, 31, 35, 36, 38, 42, 45, 46, 47, 58, 62, 65, 72, 74, 78, 81, 88, 89, 99],
  "Web3 生态": [26, 55, 75],
  交易与策略: [],
};

function categoryForRank(rank: number): BinanceInfluenceCategory {
  return binanceInfluenceCategories.find((category) => categoryRanks[category].includes(rank)) ?? "交易与策略";
}

export const binanceInfluenceAccounts: readonly BinanceInfluenceAccount[] = influenceFacts.map(
  ([rank, name, kolFollowers, followers]) => {
    const detail = binanceInfluenceDetailsByRank.get(rank);
    return {
      rank,
      name,
      kolFollowers,
      followers,
      category: categoryForRank(rank),
      sourcePart: rank <= 50 ? 1 : 2,
      bio: detail?.bio ?? "",
      profileUrl: detail?.profileUrl,
    };
  },
);

export const binanceInfluenceFollowerTotal = binanceInfluenceAccounts.reduce(
  (total, account) => total + account.followers,
  0,
);
