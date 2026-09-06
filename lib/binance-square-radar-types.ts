export type SquareRadarCoin = {
  coin: string;
  type: string;
  webLink: string;
  isPinned: boolean;
  change: number | null;
  price: string;
};

export type SquareRadarCreator = {
  id: string;
  name: string;
  avatar: string;
  squareUid: string;
  profileUrl: string;
  categoryIds: string[];
  recommended: boolean;
  featured: boolean;
  tags: string[];
  isLive: boolean;
  liveId: string;
  liveTitle: string;
  webLink: string;
  onlineNow: number;
  maxOnline: number;
  viewers: number;
  chatCount: number;
  tipAmount: number;
  subscribeCount: number;
  hasRedBox: boolean;
  isVideo: boolean;
  coins: SquareRadarCoin[];
  liveStartAt: number | null;
};

export type SquareRadarCategory = {
  id: string;
  name: string;
  sort: number;
};

export type SquareRadarDashboard = {
  liveCount: number;
  totalCreators: number;
  totalOnline: number;
  totalView: number;
  totalChat: number;
  totalSubscribe: number;
  totalTip: number;
};

export type SquareRadarSnapshot = {
  creators: SquareRadarCreator[];
  categories: SquareRadarCategory[];
  dashboard: SquareRadarDashboard;
  fetchedAt: string;
  source: string;
  degraded: boolean;
  notice: string;
};
