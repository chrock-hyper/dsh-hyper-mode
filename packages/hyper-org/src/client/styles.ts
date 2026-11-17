/**
 * The orders board stylesheet, in one string.
 *
 * Injected with `<style>{STYLES}</style>`, exactly as the hand-written module
 * did, so class names, selectors and cascade order stay the visual contract
 * with the running app. Do not reformat: `scripts/preview.mjs` imports this
 * module and inlines the string verbatim into the static preview, and the CSS
 * is compared as text when the board is restyled.
 */
export const STYLES = `
.ho-root, .ho-root *, .ho-root *::before, .ho-root *::after { box-sizing:border-box; }
.ho-root { display:flex; flex-direction:column; flex:1 1 auto; width:100%; height:100%; min-height:0;
  color:var(--dsw-alias-label-primary,#1f2328); background:var(--dsw-alias-bg-base,transparent);
  font-size:13px; line-height:1.5; overflow:hidden; }
.ho-banners { display:flex; flex-direction:column; gap:6px; padding:7px 12px; flex:none;
  border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-banner { display:flex; align-items:center; gap:8px; padding:4px 9px; border-radius:7px;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); font-size:11.5px; }
.ho-banner-error { border-color:var(--dsw-alias-state-error-primary,#dc2626); color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-banner-ok { border-color:var(--dsw-alias-state-success-primary,#16a34a); color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-banner-warn { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706);
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-banner-info { border-color:var(--dsw-alias-border-l2,#d1d5db); }
.ho-banner-text { flex:1 1 auto; min-width:0; word-break:break-word; }
.ho-empty-session { flex:1 1 auto; display:flex; align-items:center; justify-content:center; }
.ho-top { flex:none; display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 12px;
  border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-top-title { font-weight:600; font-size:13.5px; }
.ho-top-count { color:var(--dsw-alias-label-secondary,#6b7280); font-weight:500; }
.ho-stats { display:flex; gap:6px; flex:1 1 auto; flex-wrap:wrap; align-items:center; }
.ho-stat { display:inline-flex; align-items:baseline; gap:5px; padding:1px 8px; border-radius:999px;
  font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280);
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-stat b { font-size:12.5px; color:var(--dsw-alias-label-primary,#1f2328); }
.ho-stat-warn { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-stat-warn b { color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-stat-danger { border-color:var(--dsw-alias-state-error-primary,#dc2626); color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-stat-danger b { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-stat-ok b { color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-top-actions { display:flex; align-items:center; gap:6px; margin-left:auto; }
.ho-drag-hint { display:none; }
.ho-main { flex:1 1 auto; min-width:0; min-height:0; display:flex; overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-board-wrap { flex:1 1 auto; width:100%; min-width:0; min-height:0; display:flex;
  flex-direction:column; overflow:hidden; }
.ho-board { flex:1 1 auto; width:100%; min-width:0; min-height:0; display:flex; gap:8px; padding:10px;
  overflow-x:auto; overflow-y:hidden; align-items:stretch; }
.ho-col { flex:0 0 auto; width:calc((100% - 32px) / 5); min-width:150px; display:flex;
  flex-direction:column; min-height:0;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:10px;
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-col-over { border-color:var(--dsw-alias-brand-primary,#2563eb);
  box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary,#2563eb); }
.ho-col-head { display:flex; align-items:center; gap:6px; padding:7px 9px; flex:none;
  border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb); font-size:11.5px; font-weight:600;
  color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-col-sub { font-weight:400; font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-col-count { margin-left:auto; font-weight:600; color:var(--dsw-alias-label-primary,#1f2328); }
.ho-dot { width:7px; height:7px; border-radius:50%; background:var(--dsw-alias-label-secondary,#9aa1ab); flex:none; }
.ho-dot-intake { background:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-dot-active { background:var(--dsw-alias-brand-primary,#2563eb); }
.ho-dot-review { background:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-dot-blocked { background:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-dot-done { background:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-dot-dropped { background:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-col-note { margin:0; padding:4px 9px 0; font-size:10px; color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-col-body { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; padding:8px;
  display:flex; flex-direction:column; gap:7px; }
.ho-col-empty { margin:8px 0; text-align:center; font-size:11.5px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-col-foot { flex:none; display:flex; justify-content:space-between; gap:6px; padding:5px 9px;
  border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb); font-size:10.5px;
  color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-card { display:flex; flex-direction:column; gap:4px; padding:7px 9px; border-radius:9px; cursor:pointer;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-card:hover { border-color:var(--dsw-alias-border-l2,#d1d5db); }
.ho-card:focus-visible { outline:2px solid var(--dsw-alias-brand-primary,#2563eb); outline-offset:1px; }
.ho-card-on { border-color:var(--dsw-alias-brand-primary,#2563eb);
  background:color-mix(in srgb, var(--dsw-alias-brand-primary,#2563eb) 10%, var(--dsw-alias-bg-layer-1,#fff));
  box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary,#2563eb); }
.ho-card-compact { min-width:200px; max-width:300px; }
.ho-card-dragging { opacity:.5; }
.ho-card-bounce { animation:ho-shake .34s ease; }
.ho-card-title { font-weight:550; word-break:break-word; display:-webkit-box; -webkit-line-clamp:2;
  -webkit-box-orient:vertical; overflow:hidden; }
.ho-card-meta { display:flex; align-items:center; gap:5px; flex-wrap:wrap; font-size:11px;
  color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-chip { font-size:10px; line-height:1.5; padding:0 5px; border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-chip-size { font-weight:600; color:var(--dsw-alias-label-primary,#1f2328);
  border-color:var(--dsw-alias-border-l2,#d1d5db); }
.ho-chip-warn { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-chip-danger { border-color:var(--dsw-alias-state-error-primary,#dc2626); color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-chip-global { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-card-warns { display:flex; gap:4px; flex-wrap:wrap; }
.ho-card-foot { display:flex; justify-content:space-between; gap:6px; font-size:10px;
  color:var(--dsw-alias-label-secondary,#9aa1ab); white-space:nowrap; min-width:0; }
.ho-card-foot-main { min-width:0; overflow:hidden; text-overflow:ellipsis; }
.ho-card-foot-side { flex:none; }
.ho-card-signed { font-size:10.5px; color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-archive { flex:none; border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  background:var(--dsw-alias-bg-layer-1,#fff); padding:6px 10px 8px; max-height:190px; overflow:auto; }
.ho-archive-over { box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary,#2563eb); }
.ho-archive-btn { display:flex; align-items:center; gap:8px; width:100%; padding:0; border:none;
  background:none; color:var(--dsw-alias-label-secondary,#6b7280); font:inherit; font-size:11.5px;
  cursor:pointer; text-align:left; }
.ho-archive-list { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
.ho-archive-empty { margin:6px 0 0; font-size:11px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-checker { flex:none; width:300px; min-width:0; display:flex; flex-direction:column; min-height:0;
  border-left:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-checker-closed { width:40px; align-items:center; padding-top:8px; gap:8px; }
.ho-checker-closed-label { writing-mode:vertical-rl; font-size:11px; letter-spacing:.16em;
  color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-checker-head { flex:none; display:flex; align-items:center; justify-content:space-between;
  padding:7px 10px; border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb); }
.ho-checker-title { font-size:12px; font-weight:600; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-checker-body { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden;
  padding:10px 12px 24px; display:flex; flex-direction:column; gap:10px; }
.ho-placeholder { flex:1 1 auto; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:6px; color:var(--dsw-alias-label-secondary,#6b7280); padding:24px 18px; text-align:center; }
.ho-placeholder-mark { font-size:22px; opacity:.5; }
.ho-placeholder-sub { font-size:11px; }
.ho-ins-head { display:flex; flex-direction:column; gap:3px; }
.ho-ins-title { margin:0; font-size:15px; font-weight:600; word-break:break-word; }
.ho-ins-meta { display:flex; gap:6px; flex-wrap:wrap; font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-sec { border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb); padding-top:7px; }
.ho-sec-label { font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); margin-bottom:3px; }
.ho-sec-body { min-width:0; word-break:break-word; }
.ho-stage-row { display:flex; align-items:baseline; }
.ho-stage { font-weight:600; }
.ho-stage-done { color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-stage-blocked { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-stage-review { color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-stage-active { color:var(--dsw-alias-brand-primary,#2563eb); }
.ho-acceptance { margin:0; padding-left:17px; }
.ho-acceptance li { margin:1px 0; word-break:break-word; }
.ho-muted { color:var(--dsw-alias-label-secondary,#6b7280); font-size:12px; }
.ho-faint { color:var(--dsw-alias-label-secondary,#9aa1ab); font-size:10.5px; }
.ho-hint { margin:2px 0; font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.ho-warnbox { margin:2px 0; padding:4px 8px; border-radius:6px; font-size:11.5px;
  border:1px solid var(--dsw-alias-state-warn-primary,#d97706);
  color:var(--dsw-alias-state-warn-primary,#d97706); background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-arts { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:5px; }
.ho-art { display:flex; flex-direction:column; gap:2px; padding:4px 0; }
.ho-art-top { display:flex; align-items:baseline; gap:6px; min-width:0; }
.ho-art-path { flex:1 1 auto; min-width:0; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:11.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ho-art-kind { flex:none; font-size:10px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-art-missing .ho-art-kind, .ho-art-escape .ho-art-kind { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-art-open { align-self:flex-start; border:none; background:none; padding:0; cursor:pointer;
  font:inherit; font-size:11.5px; color:var(--dsw-alias-brand-primary,#2563eb); }
.ho-art-open:hover:not(:disabled) { text-decoration:underline; }
.ho-art-open:disabled { color:var(--dsw-alias-label-secondary,#9aa1ab); cursor:default; }
.ho-art-hint { font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-link { border:none; background:none; color:var(--dsw-alias-brand-primary,#2563eb); cursor:pointer;
  padding:0 2px; font-size:11px; }
.ho-log { max-height:280px; overflow:auto; }
.ho-log-list { display:flex; flex-direction:column; gap:7px; }
.ho-log-row { border-left:2px solid var(--dsw-alias-border-l2,#d1d5db); padding-left:7px; }
.ho-log-meta { font-size:10.5px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-log-note { margin:1px 0 0; white-space:pre-wrap; word-break:break-word; font-size:12px; }
.ho-log-count { margin-top:6px; font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-cardpanel { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:9px;
  padding:8px 9px; background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-panel-title { margin:0 0 7px; font-size:12.5px; font-weight:600; }
.ho-field { display:flex; flex-direction:column; gap:3px; margin-bottom:7px; }
.ho-label { font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-input, .ho-textarea { width:100%; border:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  border-radius:7px; padding:5px 7px; background:var(--dsw-alias-bg-layer-1,#fff); color:inherit;
  outline:none; font:inherit; }
.ho-input:focus, .ho-textarea:focus { border-color:var(--dsw-alias-brand-primary,#2563eb); }
.ho-textarea { resize:vertical; min-height:56px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12px; }
.ho-sign-note { min-height:58px; margin-bottom:4px; }
.ho-artifacts-input { min-height:44px; }
.ho-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.ho-btn { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff);
  color:inherit; padding:4px 10px; border-radius:7px; font-size:12px; cursor:pointer; white-space:nowrap; }
.ho-btn:hover:not(:disabled) { border-color:var(--dsw-alias-border-l2,#d1d5db); }
.ho-btn:disabled { opacity:.45; cursor:default; }
.ho-primary { background:var(--dsw-alias-brand-primary,#2563eb); border-color:var(--dsw-alias-brand-primary,#2563eb); color:#fff; }
.ho-danger { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-ghost { border-color:transparent; background:transparent; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-blockers { list-style:none; margin:0 0 6px; padding:0; display:flex; flex-direction:column; gap:4px; }
.ho-blocker { font-size:11px; color:var(--dsw-alias-state-warn-primary,#d97706); word-break:break-word; }
.ho-problems { flex:none; padding:4px 12px; border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); font-size:11.5px;
  color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-problems-head { border:none; background:none; color:inherit; font:inherit; cursor:pointer; padding:0; }
.ho-problem-list { margin:4px 0 3px; padding-left:16px; }
.ho-problem-item { word-break:break-all; }
.ho-modal { position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:center;
  padding:20px; background:rgba(15,23,42,.38); }
.ho-modal-card { width:min(540px, 100%); max-height:84vh; overflow:auto; padding:14px 16px;
  border-radius:12px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  background:var(--dsw-alias-bg-layer-1,#fff); box-shadow:0 18px 50px rgba(15,23,42,.28); }
.ho-modal-title { margin:0 0 4px; font-size:14px; font-weight:600; }
.ho-seg { display:flex; gap:2px; padding:2px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  border-radius:8px; background:var(--dsw-alias-bg-layer-2,#f3f4f6); }
.ho-seg-btn { flex:1; border:none; background:none; padding:3px 8px; border-radius:6px; font-size:12px;
  color:var(--dsw-alias-label-secondary,#6b7280); cursor:pointer; }
.ho-seg-btn:disabled { opacity:.45; cursor:default; }
.ho-seg-on { background:var(--dsw-alias-bg-layer-1,#fff); color:var(--dsw-alias-label-primary,#111827);
  box-shadow:0 1px 2px rgba(0,0,0,.06); }
@keyframes ho-shake {
  0%, 100% { transform:translateX(0); }
  25% { transform:translateX(-3px); }
  75% { transform:translateX(3px); }
}
@media (max-width:1239px) {
  .ho-checker { width:286px; }
  .ho-checker-closed { width:36px; }
  .ho-drag-hint { display:none; }
  .ho-col { min-width:160px; }
  .ho-top { gap:6px; }
}
`
