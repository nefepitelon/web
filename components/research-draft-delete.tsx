"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteResearchDraftAction } from "@/app/actions/research";

export function ResearchDraftDelete({ articleId, title }: { articleId: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  const action = deleteResearchDraftAction.bind(null, articleId);

  if (!confirming) {
    return <button type="button" className="research-draft-delete" onClick={() => setConfirming(true)}><Trash2 aria-hidden="true" />删除草稿</button>;
  }

  return (
    <form action={action} className="research-draft-delete-confirm" aria-label={`永久删除草稿：${title}`}>
      <span>永久删除？</span>
      <button type="submit"><Trash2 aria-hidden="true" />确认</button>
      <button type="button" onClick={() => setConfirming(false)} aria-label="取消删除"><X aria-hidden="true" /></button>
    </form>
  );
}
