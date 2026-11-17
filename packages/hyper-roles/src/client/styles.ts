/**
 * The panel's stylesheet, as one string.
 *
 * The panel injects it with `<style>{STYLES}</style>` — the same way the
 * hand-written module did, so the class names and cascade order below are the
 * visual contract with the running app. Do not reformat: `scripts/preview.mjs`
 * extracts this template literal verbatim for the static preview, and the CSS
 * is compared as text when the panel is restyled.
 */
export const STYLES = `
.hr-tab, .hr-tab *, .hr-tab *::before, .hr-tab *::after { box-sizing:border-box; }
.hr-tab { display:flex; flex-direction:column; flex:1 1 auto; width:100%; height:100%; min-height:0;
  color:var(--dsw-alias-label-primary,#1f2328); background:var(--dsw-alias-bg-base,transparent);
  font-size:13px; line-height:1.55; overflow:hidden; }
.hr-banners { display:flex; gap:8px; flex-wrap:wrap; padding:7px 14px; border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  background:var(--dsw-alias-bg-layer-1,#fff); flex:none; }
.hr-list-head { position:sticky; top:0; z-index:2; display:flex; flex-direction:column; gap:6px;
  padding:2px 0 10px; background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-new { display:flex; align-items:center; justify-content:center; width:100%; padding:5px 8px;
  border:1px dashed var(--dsw-alias-border-l2,#d1d5db); border-radius:7px; background:var(--dsw-alias-bg-layer-2,#f8f9fb);
  color:var(--dsw-alias-label-secondary,#6b7280); font-size:12px; cursor:pointer; }
.hr-new:hover:not(:disabled) { border-color:var(--dsw-alias-brand-primary,#2563eb); color:var(--dsw-alias-brand-primary,#2563eb); }
.hr-new:disabled { opacity:.45; cursor:default; }
.hr-grow { flex:1; }
.hr-seg { display:flex; gap:2px; padding:2px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:8px; background:var(--dsw-alias-bg-layer-2,#f3f4f6); }
.hr-seg-btn { border:none; background:none; padding:3px 9px; border-radius:6px; font-size:12px; color:var(--dsw-alias-label-secondary,#6b7280); cursor:pointer; }
.hr-seg-on { background:var(--dsw-alias-bg-layer-1,#fff); color:var(--dsw-alias-label-primary,#111827); box-shadow:0 1px 2px rgba(0,0,0,.06); }
.hr-filter { width:180px; }
.hr-tokens { display:flex; flex-wrap:wrap; align-items:center; gap:4px; min-height:32px; padding:3px 6px;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:7px; background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.hr-tokens:focus-within { border-color:var(--dsw-alias-brand-primary,#2563eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-chip { display:inline-flex; align-items:center; gap:2px; padding:1px 3px 1px 7px; border-radius:6px; font-size:11.5px;
  background:color-mix(in srgb, var(--dsw-alias-brand-primary,#2563eb) 10%, var(--dsw-alias-bg-layer-1,#fff));
  color:var(--dsw-alias-label-primary,#1f2328); }
.hr-chip-x { border:none; background:none; color:inherit; opacity:.5; cursor:pointer; padding:0 2px; font-size:12px; line-height:1; }
.hr-chip-x:hover { opacity:1; }
.hr-token-input { flex:1; min-width:90px; border:none; outline:none; background:transparent; font:inherit; padding:2px 0; color:inherit; }
.hr-suggest { display:flex; flex-wrap:wrap; gap:4px; margin-top:3px; }
.hr-suggest-item { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff);
  border-radius:6px; padding:1px 6px; font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); cursor:pointer; }
.hr-suggest-item:hover { border-color:var(--dsw-alias-brand-primary,#2563eb); color:var(--dsw-alias-brand-primary,#2563eb); }
.hr-input, .hr-textarea { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:7px; padding:6px 8px;
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); color:inherit; outline:none; font:inherit; }
.hr-input:focus, .hr-textarea:focus { border-color:var(--dsw-alias-brand-primary,#2563eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-btn { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); color:inherit;
  padding:4px 10px; border-radius:7px; font-size:12px; cursor:pointer; white-space:nowrap; }
.hr-btn:hover { border-color:var(--dsw-alias-border-l2,#d1d5db); }
.hr-btn:disabled { opacity:.45; cursor:default; }
.hr-primary { background:var(--dsw-alias-brand-primary,#2563eb); border-color:var(--dsw-alias-brand-primary,#2563eb); color:#fff; }
.hr-danger { color:var(--dsw-alias-state-error-primary,#dc2626); }
.hr-ghost { border-color:transparent; background:transparent; color:var(--dsw-alias-label-secondary,#6b7280); }
.hr-body-cols { flex:1 1 auto; min-height:0; display:grid; grid-template-columns:250px minmax(0,1fr) 268px;
  background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-col { min-height:0; overflow-y:auto; overflow-x:hidden; }
.hr-list-col { border-right:1px solid var(--dsw-alias-border-l1,#e5e7eb); padding:0 8px 8px; }
.hr-editor-col { padding:14px 16px 40px; }
.hr-side-col { border-left:1px solid var(--dsw-alias-border-l1,#e5e7eb); padding:12px; }
.hr-rows { list-style:none; margin:0; padding:0; }
.hr-row { display:flex; flex-direction:column; gap:2px; padding:8px 9px; border-radius:8px; cursor:pointer; }
.hr-row:hover { background:var(--dsw-alias-bg-layer-2,#f3f4f6); }
.hr-row-on { background:color-mix(in srgb, var(--dsw-alias-brand-primary,#2563eb) 14%, var(--dsw-alias-bg-layer-1,#fff));
  box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary,#2563eb); }
.hr-row-title { font-weight:550; }
.hr-row-meta { font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); display:flex; gap:6px; align-items:center; }
.hr-row-builtin { cursor:default; }
.hr-installed { font-style:normal; font-size:10.5px; color:var(--dsw-alias-state-success-primary,#16a34a); }
.hr-badge { font-style:normal; font-size:10px; padding:0 4px; border-radius:999px; border:1px solid var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); }
.hr-builtins { margin-top:14px; border-top:1px dashed var(--dsw-alias-border-l1,#e5e7eb); padding-top:8px; }
.hr-link { border:none; background:none; color:var(--dsw-alias-brand-primary,#2563eb); cursor:pointer; padding:0 2px; font-size:11px; }
.hr-create { display:flex; flex-direction:column; gap:6px; padding:8px; border:1px dashed var(--dsw-alias-border-l2,#d1d5db); border-radius:8px; margin-bottom:8px; }
.hr-create-actions { display:flex; justify-content:flex-end; gap:6px; }
.hr-ed-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.hr-ed-title-wrap { flex:1; min-width:0; }
.hr-title { width:min(430px,100%); font-size:16px; font-weight:600; border:1px solid transparent; border-radius:6px;
  padding:2px 4px; background:transparent; color:inherit; outline:none; }
.hr-title:hover, .hr-title:focus { border-color:var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.hr-meta { display:flex; gap:6px; font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); margin-top:2px; flex-wrap:wrap; }
.hr-faint { color:var(--dsw-alias-label-secondary,#9aa1ab); }
.hr-dirty { color:var(--dsw-alias-state-warn-primary,#d97706); }
.hr-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.hr-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:8px 12px; margin-top:12px; }
.hr-field { display:flex; flex-direction:column; gap:3px; }
.hr-label { font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.hr-textarea { width:100%; resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; line-height:1.65; }
.hr-body { min-height:248px; margin-top:10px; }
.hr-guide { margin-top:10px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:8px; padding:0 10px 8px; background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.hr-guide summary { padding:7px 0; cursor:pointer; font-size:12px; color:var(--dsw-alias-label-secondary,#6b7280); }
.hr-guide-text { min-height:70px; background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-guide-actions { display:flex; justify-content:flex-end; margin-top:6px; }
.hr-hint { font-size:11px; color:var(--dsw-alias-label-secondary,#9aa1ab); margin:10px 0 0; }
.hr-side-title { font-size:12px; font-weight:600; margin:0 0 8px; }
.hr-note-list { list-style:none; margin:0 0 10px; padding:0; display:flex; flex-direction:column; gap:8px; }
.hr-note-list li { border-left:2px solid var(--dsw-alias-border-l2,#d1d5db); padding-left:7px; }
.hr-note-meta { font-size:10.5px; color:var(--dsw-alias-label-secondary,#6b7280); }
.hr-note-list p { margin:2px 0 0; white-space:pre-wrap; word-break:break-word; }
.hr-note-input { min-height:64px; margin-bottom:6px; background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-note-actions { display:flex; justify-content:flex-end; }
.hr-banner { display:inline-flex; align-items:center; gap:8px; padding:4px 9px; border-radius:7px; font-size:11.5px;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); max-width:46ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hr-warn { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); margin-bottom:8px; display:flex; justify-content:space-between; }
.hr-error { border-color:var(--dsw-alias-state-error-primary,#dc2626); color:var(--dsw-alias-state-error-primary,#dc2626); }
.hr-ok { border-color:var(--dsw-alias-state-success-primary,#16a34a); color:var(--dsw-alias-state-success-primary,#16a34a); }
.hr-muted { color:var(--dsw-alias-label-secondary,#6b7280); font-size:12px; }
.hr-pad { padding:8px; }
@media (max-width: 1239px) {
  .hr-body-cols { grid-template-columns:250px minmax(0,1fr); grid-template-rows:minmax(0,1fr) 240px; }
  .hr-side-col { grid-column:1 / -1; border-left:0; border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb); }
}
`
