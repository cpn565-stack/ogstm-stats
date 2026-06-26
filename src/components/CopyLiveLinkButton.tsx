"use client";

import { appPath } from "@/lib/paths";
import { useState } from "react";

interface CopyLiveLinkButtonProps {
  sessionId: string;
}

export function CopyLiveLinkButton({ sessionId }: CopyLiveLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}${appPath(`/session/${sessionId}/live`)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("複製此連結給講師：", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-slate-700/80 bg-slate-900/50 px-5 py-4 text-left transition hover:bg-slate-800/60"
    >
      <div>
        <p className="font-semibold text-slate-100">複製講師即時連結</p>
        <p className="text-sm text-slate-400">
          無需登入，講師點開即可看排行與完整統計，每 20 秒自動更新
        </p>
      </div>
      <span className="shrink-0 text-sm font-medium text-emerald-400">
        {copied ? "已複製 ✓" : "複製"}
      </span>
    </button>
  );
}
