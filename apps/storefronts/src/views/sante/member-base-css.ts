/* The member base styles, as TWCinc's negosyoonline_members/base.html writes them in its <style> block
   (approved design E4-G1): the .e4 variables, and the member classes (.card, .btn, .fld, .inp, .note ...) the
   Santé sign-in and dashboard pages use. Copied character for character. The policy allows inline style. */
export const MEMBER_BASE_CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0}
.e4{--accent:#1F7A5C;--ink:#14201B;--muted:#4B5A53;--line:#D5DDD8;--bg:#F6F8F6;--card:#FFFFFF;--err:#B3261E;--warnbg:#FFF4D6;--warnink:#5A3F00;font-family:"DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink);background:var(--bg);font-size:16px;line-height:1.5;min-height:100vh;display:flex;flex-direction:column}
.e4 h1{font-size:24px;line-height:1.25;margin:0 0 8px;font-weight:700}
.e4 h2{font-size:18px;line-height:1.3;margin:0 0 8px;font-weight:700}
.e4 p{margin:0 0 12px}
.e4 form{margin:0}
.hd{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:var(--card);border-bottom:1px solid var(--line);flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;min-width:0;overflow-wrap:anywhere}
.mark{width:32px;height:32px;flex:none;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px}
.who{display:flex;gap:12px;align-items:center;font-size:15px}
.who span{display:none}
.lnk{color:var(--accent);text-decoration:underline;font-weight:500}
.ft{padding:18px 20px;border-top:1px solid var(--line);color:var(--muted);font-size:14px;background:var(--card)}
.wrap{flex:1;padding:20px 16px;display:flex;justify-content:center;align-items:flex-start}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;width:100%;max-width:420px}
.card.wide{max-width:none}
.fld{margin:0 0 16px}
.fld label{display:block;font-weight:600;font-size:15px;margin-bottom:6px}
.inp{display:block;width:100%;height:48px;border:1px solid #8A9791;border-radius:8px;padding:0 14px;font:inherit;color:var(--ink);background:#fff}
.inp:focus{outline:3px solid var(--accent);outline-offset:1px}
.inp.bad{border-color:var(--err);border-width:2px}
.hint{font-size:14px;color:var(--muted);margin:6px 0 0}
.err{font-size:14px;color:var(--err);margin:6px 0 0;font-weight:500}
.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;border-radius:8px;border:2px solid var(--accent);background:var(--accent);color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;padding:0 16px}
.btn.ghost{background:#fff;color:var(--accent)}
.btn.sm{width:auto;min-height:40px}
.btn.inline{display:inline-flex}
.link-btn{background:none;border:0;padding:0;font:inherit;color:var(--accent);text-decoration:underline;font-weight:500;cursor:pointer}
.stack{display:flex;flex-direction:column;gap:12px}
.note{border-radius:8px;padding:12px 14px;font-size:15px;margin:0 0 16px}
.note.info{background:#E8F2EE;color:#134A38}
.note.warn{background:var(--warnbg);color:var(--warnink);border:1px solid #E6C86A}
.note.bad{background:#FCE9E7;color:#7A1710}
.badge{display:inline-block;flex:none;font-size:13px;font-weight:700;border-radius:999px;padding:2px 10px}
.badge.ok{background:#DCEFE6;color:#0F5238}
.badge.pend{background:var(--warnbg);color:var(--warnink)}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.row small{display:block;color:var(--muted);font-size:14px;overflow-wrap:anywhere}
.shell{flex:1;display:block}
.main{padding:20px 16px;min-width:0}
.tabs{display:flex;gap:6px;padding:8px 16px;background:var(--card);border-bottom:1px solid var(--line)}
.tabs a{padding:10px 14px;border-radius:8px;text-decoration:none;color:var(--ink);font-weight:500;min-height:44px;display:flex;align-items:center}
.tabs a.on{background:#DCEFE6;color:#0F5238;font-weight:700}
.step{margin:0 0 4px;font-size:14px;color:var(--muted)}
.links a{margin-right:6px}
@media (min-width:820px){
.hd{padding:14px 20px}
.who span{display:inline}
.wrap{padding:64px 20px;align-items:center}
.shell{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;padding:28px 20px;max-width:1100px;width:100%;margin:0 auto;align-items:start}
.tabs{flex-direction:column;gap:4px;padding:0;background:none;border:0}
.main{padding:0}
}
`;
