/**
 * Panel CSS, shipped inline by `<style>{STYLES}</style>` so unmounting the
 * panel removes it. Moved verbatim from the original single-file client.
 */
export const STYLES = `
.dw-root, .dw-root *, .dw-root *::before, .dw-root *::after { box-sizing: border-box; }
.dw-root { position: relative; flex: 1 1 auto; width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box; color: var(--dsw-alias-label-primary, #1f2328); background: var(--dsw-alias-bg-base, transparent); font-size: 13px; line-height: 1.55; overflow: hidden; }
.dw-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 18px clamp(16px, 3vw, 28px) 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }
[data-platform="darwin"] .dw-header { padding-top: calc(18px + var(--dsh-frame-top-clearance, 0px)); }
.dw-heading { display: flex; align-items: baseline; gap: 12px; min-width: 0; flex-wrap: wrap; }
.dw-heading h1 { margin: 0; font-size: 17px; font-weight: 600; line-height: 24px; }
.dw-subtitle { font-size: 12.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dw-segmented { display: inline-flex; padding: 2px; gap: 2px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }
.dw-segment { font: inherit; font-size: 12.5px; line-height: 22px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary, #6b7280); cursor: pointer; }
.dw-segment-active { background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #1f2328); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.dw-segment:disabled { opacity: .45; cursor: not-allowed; }
.dw-chip { font-size: 11.5px; padding: 1px 9px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-secondary, #6b7280); white-space: nowrap; }
.dw-chip-quiet { opacity: .8; }
.dw-button { font: inherit; font-size: 12.5px; line-height: 26px; height: 28px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2328); cursor: pointer; white-space: nowrap; }
.dw-button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.dw-button:disabled { opacity: .5; cursor: not-allowed; }
.dw-primary { background: var(--dsw-alias-brand-primary, #2563eb); border-color: var(--dsw-alias-brand-primary, #2563eb); color: #fff; }
.dw-primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary, #2563eb); filter: brightness(.95); }
.dw-danger { color: var(--dsw-alias-state-error-primary, #dc2626); border-color: var(--dsw-alias-state-error-primary, #dc2626); }
.dw-warn-button { color: var(--dsw-alias-state-warn-primary, #d97706); border-color: var(--dsw-alias-state-warn-primary, #d97706); }
.dw-select { font: inherit; font-size: 12.5px; height: 28px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; max-width: 320px; }
.dw-banner { display: flex; align-items: center; gap: 10px; margin: 8px clamp(16px, 3vw, 28px) 0; padding: 6px 10px; border-radius: 8px; font-size: 12.5px; }
.dw-banner-error { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 12%, transparent); color: var(--dsw-alias-state-error-primary, #dc2626); }
.dw-banner-ok { background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #059669) 12%, transparent); color: var(--dsw-alias-state-success-primary, #059669); }
.dw-banner-close { margin-left: auto; border: 0; background: none; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; }
.dw-body { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 250px minmax(0, 1fr) 310px; background: var(--dsw-alias-bg-layer-1, #fff); }
.dw-tree { min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px; border-right: 1px solid var(--dsw-alias-border-l1, #e5e7eb); overflow-y: auto; overflow-x: hidden; background: var(--dsw-alias-bg-layer-1, #fff); }
.dw-treehead { display: flex; flex-direction: column; gap: 6px; margin-bottom: 2px; }
.dw-newpage { display: flex; align-items: center; justify-content: center; width: 100%; padding: 5px 8px;
  border: 1px dashed var(--dsw-alias-border-l2, #d6dae1); border-radius: 7px; background: var(--dsw-alias-bg-layer-2, #f8f9fb);
  color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; cursor: pointer; }
.dw-newpage:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary, #2563eb); color: var(--dsw-alias-brand-primary, #2563eb); }
.dw-newpage:disabled { opacity: .45; cursor: default; }
.dw-create { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px dashed var(--dsw-alias-border-l2, #d6dae1); border-radius: 8px; }
.dw-create-actions { display: flex; justify-content: flex-end; gap: 6px; }
.dw-main { min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; overflow-y: auto; overflow-x: hidden; }
.dw-rail { min-width: 0; display: flex; flex-direction: column; gap: 14px; padding: 12px; border-left: 1px solid var(--dsw-alias-border-l1, #e5e7eb); overflow-y: auto; overflow-x: hidden; background: var(--dsw-alias-bg-layer-1, #fff); }
.dw-input { font: inherit; font-size: 13px; width: 100%; box-sizing: border-box; padding: 6px 9px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; }
.dw-search { flex: none; }
.dw-tree-meta { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-page-list, .dw-queue-list, .dw-backlinks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.dw-page-row { display: block; width: 100%; text-align: left; font: inherit; padding: 5px 7px; border: 0; border-radius: 8px; background: none; color: inherit; cursor: pointer; }
.dw-page-row:hover { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.dw-page-row-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 10%, transparent); }
.dw-page-title { display: block; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dw-page-sub { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dw-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--dsw-alias-label-secondary, #9ca3af); flex: none; display: inline-block; }
.dw-dot-stable { background: var(--dsw-alias-state-success-primary, #059669); }
.dw-dot-wip { background: var(--dsw-alias-state-warn-primary, #d97706); }
.dw-dot-deprecated { background: var(--dsw-alias-state-error-primary, #dc2626); }
.dw-badge { margin-left: 4px; font-size: 10px; padding: 0 6px; border-radius: 999px; line-height: 15px; }
.dw-badge-pending { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 16%, transparent); color: var(--dsw-alias-state-warn-primary, #d97706); }
.dw-badge-rejected { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 14%, transparent); color: var(--dsw-alias-state-error-primary, #dc2626); }
.dw-queue { margin-top: auto; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }
.dw-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--dsw-alias-label-secondary, #6b7280); margin-bottom: 4px; }
.dw-link { font: inherit; font-size: 12px; padding: 1px 0; border: 0; background: none; color: var(--dsw-alias-brand-primary, #2563eb); text-align: left; cursor: pointer; }
.dw-link:hover { text-decoration: underline; }
.dw-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dw-page-head h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.dw-page-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); margin-top: 2px; }
.dw-tabs { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.dw-spacer { flex: 1; min-width: 8px; }
.dw-tab { font: inherit; font-size: 12.5px; height: 26px; padding: 0 10px; border: 0; border-radius: 999px; background: none; color: var(--dsw-alias-label-secondary, #6b7280); cursor: pointer; }
.dw-tab:hover { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.dw-tab-active { background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-primary, #1f2328); font-weight: 600; }
.dw-pane { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 10px; padding: 12px; background: var(--dsw-alias-bg-layer-1, #fff); }
.dw-editor { flex: 1; min-height: 0; resize: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.6; padding: 10px 12px; border-radius: 10px; }
.dw-editor[readonly] { background: var(--dsw-alias-bg-layer-2, #f6f7f9); }
.dw-hint { font-size: 11.5px; margin: 2px 0 0; }
.dw-muted { color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-warn { color: var(--dsw-alias-state-warn-primary, #d97706); font-size: 12px; }
.dw-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; word-break: break-all; }
.dw-section { display: flex; flex-direction: column; gap: 6px; }
.dw-section h3 { margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; margin: 0; font-size: 12px; }
.dw-dl dt { color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-dl dd { margin: 0; min-width: 0; }
.dw-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.dw-reason { margin-top: 6px; padding: 6px 8px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 10%, transparent); color: var(--dsw-alias-state-error-primary, #dc2626); font-size: 12px; }
.dw-note { margin-top: 8px; padding: 6px 8px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); font-size: 11.5px; }
.dw-note ul { margin: 4px 0 0; padding-left: 16px; }
.dw-draft-banner { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; padding: 6px 9px; border-radius: 8px; margin-bottom: 8px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.dw-draft-pending { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 12%, transparent); }
.dw-draft-rejected { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 10%, transparent); }
.dw-diff-body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.dw-md-p { margin: 6px 0; white-space: pre-wrap; word-break: break-word; }
.dw-md-h { margin: 14px 0 4px; font-weight: 600; }
.dw-md-h1 { font-size: 18px; } .dw-md-h2 { font-size: 16px; } .dw-md-h3 { font-size: 15px; } .dw-md-h4, .dw-md-h5, .dw-md-h6 { font-size: 14px; }
.dw-md-li { margin: 2px 0 2px 4px; white-space: pre-wrap; }
.dw-md-quote { margin: 6px 0; padding-left: 10px; border-left: 3px solid var(--dsw-alias-border-l2, #d1d5db); color: var(--dsw-alias-label-secondary, #6b7280); white-space: pre-wrap; }
.dw-md-code { margin: 8px 0; padding: 8px 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: auto; white-space: pre; }
.dw-overlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0,0,0,.45); }
.dw-modal { width: min(460px, 92vw); max-height: 88vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); box-shadow: 0 12px 32px rgba(0,0,0,.18); }
.dw-modal h2 { margin: 0; font-size: 16px; font-weight: 600; }
.dw-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.dw-dialog-input { min-height: 32px; }
textarea.dw-dialog-input { min-height: 84px; resize: vertical; }
.dw-busy { position: absolute; right: 16px; bottom: 12px; font-size: 11.5px; padding: 3px 10px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-secondary, #6b7280); }
@media (max-width: 1080px) {
  /* The review rail keeps its actions reachable: it drops below the editor
     instead of disappearing. */
  .dw-body { grid-template-columns: 250px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 240px); }
  .dw-rail { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--dsw-alias-border-l1, #e5e7eb); flex-direction: row; flex-wrap: wrap; align-content: flex-start; gap: 16px; }
  .dw-rail .dw-section { min-width: 240px; flex: 1; }
}
`
