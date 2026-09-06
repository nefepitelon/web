"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  X
} from "lucide-react";
import { useState } from "react";
import {
  CLASSIC_GRID_ENVIRONMENT_GROUPS,
  CLASSIC_GRID_VENUE_OPTIONS,
  selectedClassicGridVenues,
  type ClassicGridMode,
  type EnvironmentField
} from "@/components/classic-grid-environment-schema";

type Props = {
  mode: ClassicGridMode;
  values: Record<string, string>;
  storageLoading: boolean;
  busy: boolean;
  savedAt: string | null;
  notice: string;
  error: string;
  confirmation: string;
  acknowledgeFunds: boolean;
  acknowledgeNoWithdrawals: boolean;
  onModeChange: (mode: ClassicGridMode) => void;
  onFieldChange: (key: string, value: string) => void;
  onConfirmationChange: (value: string) => void;
  onAcknowledgeFundsChange: (value: boolean) => void;
  onAcknowledgeNoWithdrawalsChange: (value: boolean) => void;
  onSaveLocal: () => Promise<void>;
  onStart: () => Promise<void>;
  onReset: () => Promise<void>;
  onClose: () => void;
};

function localTime(value: string | null) {
  if (!value) return "尚未保存";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "已保存在本机" : parsed.toLocaleString("zh-CN", { hour12: false });
}

function fieldRequired(field: EnvironmentField, groupVenue: string | undefined, mode: ClassicGridMode, selected: Set<string>, telegramEnabled: boolean) {
  if (field.required) return true;
  if (mode === "live" && field.requiredForLive && groupVenue && selected.has(groupVenue)) return true;
  return telegramEnabled && ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_IDS"].includes(field.key);
}

function EnvironmentFieldLabel({ field, inputId, required }: { field: EnvironmentField; inputId: string; required: boolean }) {
  const content = (
    <>
      <span>{field.label}</span>
      <code>{field.key}</code>
      <em className={required ? "required" : "optional"}>{required ? (field.requiredForLive ? "实盘必填" : "必填") : "可选"}</em>
    </>
  );
  return field.key === "VENUES"
    ? <div className="classic-grid-field-label" id={`${inputId}-label`}>{content}</div>
    : <label htmlFor={inputId}>{content}</label>;
}

export function ClassicGridEnvironmentDialog(props: Props) {
  const [showSecrets, setShowSecrets] = useState(false);
  const selectedVenues = selectedClassicGridVenues(props.values);
  const telegramEnabled = props.values.TELEGRAM_ENABLED === "true";

  return (
    <div className="classic-grid-modal" role="dialog" aria-modal="true" aria-labelledby="classic-grid-config-title">
      <div className="classic-grid-config-card classic-grid-config-card--environment">
        <div className="classic-grid-config-head">
          <div>
            <span>LOCAL ENVIRONMENT</span>
            <h2 id="classic-grid-config-title">AIClassic 环境配置</h2>
            <p>按分类填写原项目的全部环境项，并在启动前读取本浏览器保存的最新版本。</p>
          </div>
          <button type="button" aria-label="关闭环境配置" onClick={props.onClose}><X size={20} /></button>
        </div>

        <div className="classic-grid-local-banner">
          <HardDrive size={19} />
          <div>
            <strong>环境信息仅保存在当前浏览器</strong>
            <span>点击“仅保存环境”不会发起网络请求。数据使用浏览器生成的不可导出 AES-256-GCM 密钥加密，存于本机 IndexedDB；清理站点数据或更换浏览器后将无法恢复。</span>
          </div>
          <span className="classic-grid-local-state">{props.storageLoading ? "正在读取…" : localTime(props.savedAt)}</span>
        </div>

        <div className="classic-grid-deploy-guide">
          <div><span>1</span><strong>获取凭据</strong><p>在对应交易所创建仅交易权限的专用账户/API，关闭提现，并设置 IP 白名单。</p></div>
          <div><span>2</span><strong>保存到本机</strong><p>保存操作只写当前浏览器，不会写入 Vercel 环境变量或网站数据库。</p></div>
          <div><span>3</span><strong>启动服务器任务</strong><p>启动时读取最新本地版本，并通过 HTTPS 提交运行副本；这是服务器代为签名和下单的必要步骤。运行副本在服务端加密且永不回显。</p></div>
        </div>

        <div className="classic-grid-mode-tabs">
          <button className={props.mode === "paper" ? "active" : ""} type="button" onClick={() => props.onModeChange("paper")}>模拟盘（推荐）</button>
          <button className={props.mode === "live" ? "active live" : ""} type="button" onClick={() => props.onModeChange("live")}>生产实盘</button>
        </div>

        <div className="classic-grid-config-utilities">
          <p><ShieldCheck size={14} />带“实盘必填”的项目，仅在该交易场所已加入 VENUES 且选择生产实盘时要求填写。</p>
          <button type="button" onClick={() => setShowSecrets((value) => !value)}>
            {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}{showSecrets ? "隐藏敏感字段" : "临时显示敏感字段"}
          </button>
        </div>

        <form className="classic-grid-environment-form" onSubmit={(event) => event.preventDefault()}>
          {CLASSIC_GRID_ENVIRONMENT_GROUPS.map((group) => {
            const enabled = !group.venue || selectedVenues.has(group.venue);
            return (
              <details className={`classic-grid-environment-section ${enabled ? "is-enabled" : ""}`} key={group.id} open={group.id === "global" ? true : undefined}>
                <summary>
                  <div>
                    <span className="classic-grid-section-status" aria-hidden="true" />
                    <strong>{group.title}</strong>
                    {group.venue ? <em>{enabled ? "已启用" : "未加入 VENUES"}</em> : null}
                  </div>
                  <p>{group.description}</p>
                </summary>
                <div className="classic-grid-environment-section-body">
                  {group.sourceUrl ? (
                    <a className="classic-grid-source-link" href={group.sourceUrl} target="_blank" rel="noreferrer">
                      {group.sourceLabel}<ExternalLink size={12} />
                    </a>
                  ) : null}
                  <div className="classic-grid-field-grid">
                    {group.fields.map((field) => {
                      const required = fieldRequired(field, group.venue, props.mode, selectedVenues, telegramEnabled);
                      const value = field.key === "DRY_RUN"
                        ? props.mode === "paper" ? "1" : "0"
                        : field.key === "LIVE_CONFIRM" && props.mode === "live"
                          ? "启动时自动设为 YES"
                          : props.values[field.key] || "";
                      const descriptionId = `classic-grid-${field.key.toLowerCase()}-description`;
                      const inputId = `classic-grid-${field.key.toLowerCase()}`;
                      const common = {
                        id: inputId,
                        name: field.key,
                        value,
                        required,
                        disabled: props.storageLoading || (field.readOnly === true && field.kind === "select"),
                        placeholder: field.placeholder,
                        "aria-describedby": descriptionId,
                        onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => props.onFieldChange(field.key, event.target.value)
                      };
                      return (
                        <div className={`classic-grid-field ${field.wide ? "classic-grid-field--wide" : ""}`} key={field.key}>
                          <EnvironmentFieldLabel field={field} inputId={inputId} required={required} />
                          {field.key === "VENUES" ? (
                            <fieldset className="classic-grid-venue-picker" aria-labelledby={`${inputId}-label`} aria-describedby={descriptionId}>
                              <div className="classic-grid-venue-options">
                                {CLASSIC_GRID_VENUE_OPTIONS.map((venue) => {
                                  const checked = selectedVenues.has(venue.value);
                                  const isOnlySelection = checked && selectedVenues.size === 1;
                                  return (
                                    <label className={checked ? "is-selected" : ""} key={venue.value}>
                                      <input
                                        type="checkbox"
                                        name="VENUES"
                                        value={venue.value}
                                        checked={checked}
                                        disabled={props.storageLoading || isOnlySelection}
                                        onChange={(event) => {
                                          const next = new Set(selectedVenues);
                                          if (event.target.checked) next.add(venue.value);
                                          else next.delete(venue.value);
                                          const ordered = CLASSIC_GRID_VENUE_OPTIONS.filter((option) => next.has(option.value)).map((option) => option.value);
                                          props.onFieldChange("VENUES", ordered.join(","));
                                        }}
                                      />
                                      <span>{venue.label}</span>
                                      <code>{venue.value}</code>
                                    </label>
                                  );
                                })}
                              </div>
                              <output className="classic-grid-venues-output" aria-live="polite">
                                <strong>写入环境配置</strong>
                                <code>VENUES={CLASSIC_GRID_VENUE_OPTIONS.filter((venue) => selectedVenues.has(venue.value)).map((venue) => venue.value).join(",")}</code>
                              </output>
                            </fieldset>
                          ) : field.kind === "select" ? (
                            <select {...common}>
                              {(field.choices || []).map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}
                            </select>
                          ) : field.kind === "textarea" ? (
                            <textarea {...common} readOnly={field.readOnly} rows={4} spellCheck={false} />
                          ) : (
                            <div className={field.kind === "password" ? "classic-grid-secret-input" : undefined}>
                              <input
                                {...common}
                                type={field.kind === "password" && !showSecrets ? "password" : field.kind === "number" ? "number" : "text"}
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                readOnly={field.readOnly}
                                autoComplete={field.kind === "password" ? "new-password" : "off"}
                                spellCheck={false}
                              />
                              {field.kind === "password" ? <KeyRound size={13} aria-hidden="true" /> : null}
                            </div>
                          )}
                          <div className="classic-grid-field-explain" id={descriptionId}>
                            <p>{field.help}</p>
                            <span><strong>获取：</strong>{field.source}</span>
                            {field.defaultValue !== undefined ? <span><strong>默认：</strong><code>{field.defaultValue || "空"}</code></span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </details>
            );
          })}

          {props.mode === "live" ? (
            <div className="classic-grid-live-confirm">
              <strong><AlertTriangle size={15} />实盘会使用以上环境信息真实下单</strong>
              <label><input type="checkbox" checked={props.acknowledgeFunds} onChange={(event) => props.onAcknowledgeFundsChange(event.target.checked)} />我理解策略可能造成资金损失</label>
              <label><input type="checkbox" checked={props.acknowledgeNoWithdrawals} onChange={(event) => props.onAcknowledgeNoWithdrawalsChange(event.target.checked)} />交易所密钥已关闭提现权限并设置 IP 白名单</label>
              <label>输入 ENABLE CLASSIC GRID LIVE
                <input value={props.confirmation} onChange={(event) => props.onConfirmationChange(event.target.value)} autoComplete="off" />
              </label>
            </div>
          ) : null}

          {props.notice ? <div className="classic-grid-success" role="status"><CheckCircle2 size={16} />{props.notice}</div> : null}
          {props.error ? <div className="classic-grid-error" role="alert"><AlertTriangle size={16} />{props.error}</div> : null}

          <div className="classic-grid-config-footer">
            <button className="classic-grid-reset" type="button" onClick={() => void props.onReset()} disabled={props.busy || props.storageLoading}><RotateCcw size={14} />恢复默认</button>
            <div className="classic-grid-config-actions">
              <button type="button" onClick={props.onClose}>取消</button>
              <button type="button" onClick={() => void props.onSaveLocal()} disabled={props.busy || props.storageLoading}><Save size={14} />仅保存环境</button>
              <button className="classic-grid-primary" type="button" onClick={() => void props.onStart()} disabled={props.busy || props.storageLoading}>
                <Play size={14} />{props.busy ? "正在启动…" : props.mode === "paper" ? "保存并启动模拟盘" : "确认并启动实盘"}
              </button>
            </div>
          </div>
          <p className="classic-grid-replace-note">“仅保存环境”不会访问服务器；启动按钮会使用刚保存的最新本地版本创建运行任务。</p>
        </form>
      </div>
    </div>
  );
}
