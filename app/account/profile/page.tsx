import { updateProfileAction } from "@/app/actions/account";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/membership";

export default async function ProfilePage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const viewer = await requireViewer("/account/profile");
  const profile = await prisma.profile.findUnique({ where: { userId: viewer.id } });
  const query = await searchParams;

  return (
    <section className="panel">
      <div className="panel-header">
        <div><h2>个人资料</h2><p>这些信息用于个人中心、推荐页与未来社区身份展示。</p></div>
      </div>
      <div className="panel-body">
        {query.error ? <div className="form-message">{query.error}</div> : null}
        {query.saved ? <div className="form-message form-message--success">资料已保存。</div> : null}
        <form action={updateProfileAction}>
          <div className="profile-avatar-field">
            {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="当前头像" width="88" height="88" /> : <span>{(viewer.handle ?? viewer.email).slice(0,1).toUpperCase()}</span>}
            <div className="field"><label htmlFor="avatar">头像图片</label><input className="input" id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" /><small className="field-hint">JPG、PNG 或 WebP，最大 5MB。</small></div>
          </div>
          <div className="field">
            <label>用户名</label>
            <div className="input-group">
              <input className="input" value={profile?.handle ?? ""} disabled readOnly />
              <span className="input-suffix">.welinkBTC</span>
            </div>
            <span className="field-hint">用户名设置后锁定；确需修改时由管理员审核处理。</span>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="displayName">显示名称</label>
              <input className="input" id="displayName" name="displayName" maxLength={60} defaultValue={profile?.displayName ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="region">地区</label>
              <input className="input" id="region" name="region" maxLength={60} defaultValue={profile?.region ?? ""} placeholder="Shanghai / Singapore" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="website">个人网站</label>
            <input className="input" id="website" name="website" type="url" maxLength={200} defaultValue={profile?.website ?? ""} placeholder="https://" />
          </div>
          <div className="field">
            <label htmlFor="bio">个人简介</label>
            <textarea className="textarea" id="bio" name="bio" maxLength={500} defaultValue={profile?.bio ?? ""} placeholder="介绍你的研究方向、链上经验或社区角色。" />
          </div>
          <button className="button" type="submit">保存资料</button>
        </form>
      </div>
    </section>
  );
}
