import Link from "next/link";

export default function AdminUserNotFound() {
  return (
    <section className="panel">
      <div className="empty-state">
        <h2>没有找到该用户</h2>
        <p>用户可能已被删除，或访问链接已失效。</p>
        <Link className="button button--small button--light" href="/admin/users" prefetch={false}>返回用户管理</Link>
      </div>
    </section>
  );
}
