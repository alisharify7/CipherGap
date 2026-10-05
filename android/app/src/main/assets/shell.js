'use strict';
const host=CipherGapHost.request;
const urls={bale:'https://web.bale.ai/',eitaa:'https://web.eitaa.com/',telegram:'https://web.telegram.org/a/'};
const links={source:'https://github.com/alisharify7/CipherGap/tree/android',website:'https://alisharify7.github.io/CipherGap/',releases:'https://github.com/alisharify7/CipherGap/releases'};
let preferences={},appState={};
function language(){return preferences.ciphergap_ui_language==='fa'?'fa':'en';}
function status(text){const p=document.getElementById('status');p.textContent=text;p.hidden=!text;}
function render(){
 const lang=language();document.documentElement.lang=lang;document.documentElement.dir=lang==='fa'?'rtl':'ltr';
 const theme=preferences.ciphergap_ui_theme|| (matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme;
 for(const node of document.querySelectorAll('[data-en]'))node.textContent=node.dataset[lang];
 document.getElementById('guideButton').setAttribute('aria-label',lang==='fa'?'راهنما':'Guide');
 document.querySelector('nav').setAttribute('aria-label',lang==='fa'?'بخش‌ها':'Sections');
 document.getElementById('language').value=lang;document.getElementById('theme').value=theme;
 document.getElementById('enabled').checked=preferences.ciphergap_enabled!==false;
 document.getElementById('notifications').checked=Boolean(preferences.android_notifications&&appState.notificationsAllowed);
 document.getElementById('compatibility').hidden=appState.compatible!==false;
 for(const button of document.querySelectorAll('[data-messenger]'))button.disabled=appState.compatible===false;
 document.getElementById('resume').hidden=!appState.chatUrl;
 document.getElementById('version').textContent='Android '+(appState.version||'0.1.1')+' · Preview';
}
async function refresh(){[preferences,appState]=await Promise.all([chrome.storage.local.get(['ciphergap_ui_language','ciphergap_ui_theme','ciphergap_enabled','android_notifications']),host('app_state')]);render();}
window.navigate=async page=>{for(const s of document.querySelectorAll('.page'))s.hidden=s.id!==page;for(const b of document.querySelectorAll('nav [data-page]'))b.setAttribute('aria-current',b.dataset.page===page?'page':'false');status('');await host('navigate_state',{page});await refresh();window.scrollTo(0,0);};
async function safely(action){try{await action();}catch(e){status(language()==='fa'?'عملیات انجام نشد. دوباره تلاش کنید.':'The operation failed. Please try again.');}await refresh();}
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;
 if(button.dataset.page)navigate(button.dataset.page).catch(e=>status(e.message));
 if(button.dataset.messenger)safely(()=>host('open_messenger',{url:urls[button.dataset.messenger]}));
 if(button.dataset.link)safely(()=>host('external',{url:links[button.dataset.link]}));
});
document.getElementById('guideButton').onclick=()=>navigate('guide');
document.getElementById('resume').onclick=()=>safely(()=>host('resume'));
document.getElementById('securitySettings').onclick=()=>safely(()=>host('open_security'));
document.getElementById('clear').onclick=()=>safely(()=>host('clear_browser'));
document.getElementById('language').onchange=event=>safely(()=>chrome.storage.local.set({ciphergap_ui_language:event.target.value}));
document.getElementById('theme').onchange=event=>safely(()=>chrome.storage.local.set({ciphergap_ui_theme:event.target.value}));
document.getElementById('enabled').onchange=event=>safely(()=>chrome.storage.local.set({ciphergap_enabled:event.target.checked}));
document.getElementById('notifications').onchange=event=>safely(async()=>{const enabled=event.target.checked;const allowed=await host('notifications',{enabled});event.target.checked=enabled&&allowed;if(enabled&&!allowed)status(language()==='fa'?'مجوز اعلان داده نشد؛ می‌توانید از تنظیمات اندروید فعالش کنید.':'Notifications are not permitted. You can enable them in Android settings.');});
chrome.storage.onChanged.addListener(()=>refresh().catch(()=>{}));
navigate('home').catch(e=>status(e.message));
