import Link from "next/link";
import { completeOnboardingTaskAction } from "@/app/actions/onboarding";
import { onboardingTaskDefinitions } from "@/lib/onboarding-tasks";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { getReferralQualification } from "@/lib/referrals";

export default async function GettingStartedPage() {
  const viewer = await requireViewer("/account/getting-started");
  const [completed, qualification] = await Promise.all([
    prisma.userOnboardingTask.findMany({ where: { userId: viewer.id }, select: { taskKey: true, completedAt: true } }),
    getReferralQualification(viewer.id)
  ]);
  const completedKeys = new Set(completed.map((task) => task.taskKey));
  const progress = Math.round((completedKeys.size / (onboardingTaskDefinitions.length + 1)) * 100);

  return (
    <div className="section-stack">
      <section className="panel onboarding-hero">
        <div className="panel-header"><div><p className="eyebrow">NEW MEMBER FLIGHT PLAN</p><h2>新人指导任务</h2><p>用一条最短路径认识研究、信号、链上周期和执行工作台；完成全部平台任务也是“有效邀请用户”的必要条件。</p></div><strong>{Math.min(100, progress)}%</strong></div>
        <div className="panel-body"><div className="onboarding-progress"><span style={{ width: `${Math.min(100, progress)}%` }} /></div></div>
      </section>
      <section className="onboarding-task-grid">
        {onboardingTaskDefinitions.map((task, index) => {
          const done = completedKeys.has(task.key);
          return <article className={`onboarding-task ${done ? "is-complete" : ""}`} key={task.key}><span>0{index + 1}</span><div><h3>{task.title}</h3><p>{task.description}</p></div>{done ? <Link className="button button--small button--outline" href={task.href}>再次查看</Link> : <form action={completeOnboardingTaskAction.bind(null, task.key)}><button className="button button--small" type="submit">开始任务 →</button></form>}</article>;
        })}
      </section>
      <section className="panel">
        <div className="panel-header"><div><h2>有效用户进度</h2><p>完成以下动作后，邀请人将自动获得可配置的 2 USDT 有效用户奖励。</p></div><span className={qualification.qualified ? "status-pill" : "status-pill status-pill--warn"}>{qualification.qualified ? "已完成" : "进行中"}</span></div>
        <div className="panel-body qualification-grid">
          {[
            ["完成用户名设置", qualification.username, "/account/profile"],
            ["完成个人资料编辑", qualification.profile, "/account/profile"],
            ["分享一次邀请链接", qualification.shared, "/account/referrals"],
            ["绑定 X 或 Discord", qualification.social, "/account/connections"],
            ["绑定 Web3 钱包", qualification.wallet, "/account/connections"],
            [`完成平台指导任务 ${qualification.guideCompleted}/${qualification.guideTotal}`, qualification.guide, "/account/getting-started"]
          ].map(([label, done, href]) => <Link className={done ? "qualification-item is-complete" : "qualification-item"} href={String(href)} key={String(label)}><span>{done ? "✓" : "○"}</span><strong>{String(label)}</strong></Link>)}
        </div>
      </section>
    </div>
  );
}
