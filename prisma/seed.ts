import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const roles = [
  { key: "free", name: "普通用户", description: "基础会员权益" },
  { key: "pro", name: "Pro", description: "高级分析与导出权益" },
  { key: "max", name: "Max", description: "全量研究、API 与优先额度" },
  { key: "operator", name: "百宝箱操作员", description: "维护工具行与批量运营，不管理系统列" },
  { key: "admin", name: "管理员", description: "后台运营与全站管理" }
];

const plans = [
  { key: "free", name: "Free", description: "基础指标与低额度研究", monthlyCents: 0, rank: 0 },
  { key: "pro", name: "Pro", description: "高级 Dashboard、完整 Alpha Radar 与导出", monthlyCents: 900, yearlyCents: 9000, rank: 1 },
  { key: "max", name: "Max", description: "全量研究、API、高级信号与优先额度", monthlyCents: 1900, yearlyCents: 19000, rank: 2 }
];

const gates = [
  { key: "dashboard.basic", label: "Dashboard 基础指标", minimumPlan: "free", guestPreview: true, previewLimit: 4 },
  { key: "dashboard.advanced", label: "Dashboard 高级指标", minimumPlan: "pro", guestPreview: false, previewLimit: 0 },
  { key: "alpha.partial", label: "Alpha Radar 部分数据", minimumPlan: "free", guestPreview: true, previewLimit: 3 },
  { key: "alpha.full", label: "Alpha Radar 完整数据", minimumPlan: "pro", guestPreview: false, previewLimit: 0 },
  { key: "alpha.premium", label: "Alpha Radar 高级信号", minimumPlan: "max", guestPreview: false, previewLimit: 0 },
  { key: "ai.low", label: "AI Ops 低额度", minimumPlan: "free", guestPreview: true, previewLimit: 1 },
  { key: "ai.standard", label: "AI Ops 标准额度", minimumPlan: "pro", guestPreview: false, previewLimit: 0 },
  { key: "ai.priority", label: "AI Ops 高额度与优先服务", minimumPlan: "max", guestPreview: false, previewLimit: 0 },
  { key: "export.csv", label: "CSV / 报告导出", minimumPlan: "pro", guestPreview: false, previewLimit: 0 },
  { key: "api.keys", label: "API Key", minimumPlan: "max", guestPreview: false, previewLimit: 0 },
  { key: "research.deep", label: "深度研究", minimumPlan: "pro", guestPreview: true, previewLimit: 1 },
  { key: "research.full", label: "全量研究档案", minimumPlan: "max", guestPreview: false, previewLimit: 0 }
  ,{ key: "grid.ops", label: "AI 网格交易 Ops", minimumPlan: "max", guestPreview: true, previewLimit: 1 }
  ,{ key: "grid.classic", label: "AIClassic 网格", minimumPlan: "max", guestPreview: true, previewLimit: 1 }
  ,{ key: "toolbox.read", label: "百宝箱工具台", minimumPlan: "free", guestPreview: true, previewLimit: 8 }
  ,{ key: "toolbox.export", label: "百宝箱数据导出", minimumPlan: "pro", guestPreview: false, previewLimit: 0 }
];

async function main() {
  for (const role of roles) {
    await prisma.role.upsert({ where: { key: role.key }, update: role, create: role });
  }

  for (const plan of plans) {
    await prisma.plan.upsert({ where: { key: plan.key }, update: plan, create: plan });
  }

  for (const gate of gates) {
    await prisma.contentGate.upsert({ where: { key: gate.key }, update: gate, create: gate });
  }

  await prisma.systemSetting.upsert({
    where: { key: "referral.rules" },
    update: {},
    create: {
      key: "referral.rules",
      value: { registrationRewardCents: 10, validUserRewardCents: 200, level1RateBps: 1200, level2RateBps: 300, holdDays: 14 },
      description: "推荐返佣比例与结算规则"
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: "crypto.payment" },
    update: {},
    create: {
      key: "crypto.payment",
      value: {
        invoiceExpiryMinutes: 60,
        reviewSlaHours: 4,
        cnyPerUsd: 7.2,
        trc20: { enabled: false, receiveAddress: "", confirmations: 1 },
        bsc: { enabled: false, receiveAddress: "", confirmations: 12 },
        binanceUid: { enabled: false, recipient: "", recipientName: "", qrCodeUrl: "", instructions: "请通过币安内部转账向指定 UID 支付 USDT，并填写订单号或上传付款凭证。" },
        wechat: { enabled: false, recipient: "", recipientName: "", qrCodeUrl: "", instructions: "请扫码支付订单显示的人民币金额，并上传付款截图。" }
      },
      description: "多通道订阅收款设置"
    }
  });
}

main()
  .finally(async () => prisma.$disconnect());
