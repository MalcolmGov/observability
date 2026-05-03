/** Inline before React — avoids light-mode flash. Keep in sync with theme-context STORAGE_KEY. */
export const PULSE_THEME_INLINE_SCRIPT = `
(function(){
  try {
    var k='pulse-theme';
    var t=localStorage.getItem(k);
    if(t==='light') document.documentElement.setAttribute('data-theme','light');
    else document.documentElement.removeAttribute('data-theme');
  } catch(e){}
})();
`.trim();
