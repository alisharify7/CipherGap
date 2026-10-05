"""Minimal native DOM contracts captured in Your Chrome, without account data."""
import json

def html(platform):
    if platform == 'splus':
        body='''<div id="MiddleColumn"><div id="messages"></div><div><div id="native-compose-bubble"><div id="message-input-text"><div><div id="editable-message-text" role="textbox" contenteditable="true"></div></div><button id="attach-menu-button">Attach</button><div id="attach-menu-controls"><div role="menuitem">فایل</div></div></div></div><button id="native-send" aria-label="ضبط پیام صوتی">Send</button></div></div>'''
    else:
        body='''<div id="column-center"><tab-conversation><div id="messages" rb-observer-container data-chat-id="fixture"></div></tab-conversation><div rb-composer><div><div text-editor><div><div contenteditable="true"></div><textarea hidden></textarea></div><input type="file" multiple></div><div><div rb-tone-analizer></div><button id="native-send"><div ripple hidden>Send</div><div ripple>Record</div></button></div></div></div></div>'''
    script=r'''
const platform=PLATFORM,editor=document.querySelector('[contenteditable=true]');window.testSent=[];window.received=[];let counter=100,draft='';
const file=platform==='rubika'?document.querySelector('input[type=file]'):document.createElement('input');file.type='file';
file.onchange=async()=>{for(const f of file.files)received.push({name:f.name,bytes:Array.from(new Uint8Array(await f.arrayBuffer()))})};
if(platform==='splus'){const menu=document.getElementById('attach-menu-controls');menu.replaceChildren();document.getElementById('attach-menu-button').onclick=()=>setTimeout(()=>{const item=document.createElement('div');item.setAttribute('role','menuitem');item.textContent='فایل';item.onclick=()=>file.click();menu.replaceChildren(item)},30)}
function sync(){draft=editor.innerText;const send=document.getElementById('native-send');if(platform==='splus')send.setAttribute('aria-label',draft?'ارسال پیام':'ضبط پیام صوتی');else{send.firstElementChild.hidden=!draft;send.lastElementChild.hidden=!!draft}}
editor.addEventListener(platform==='rubika'?'keyup':'input',sync);
function send(){
 testSent.push(draft);
 if(platform==='splus'){
  const id=addMessage(draft,false),body=document.getElementById('message'+id).firstElementChild.firstElementChild,time=body.children[1];
  // Native Teact commits use positional children after mounting the bubble.
  // Finish that commit before an extension inserts its message controls.
  setTimeout(()=>{if(body.children[1]!==time)return;editor.textContent='';draft='';sync()},60);
 }else{editor.textContent='';draft='';sync()}
}
(platform==='rubika'?document.querySelector('#native-send > [ripple]'):document.getElementById('native-send')).onclick=send;
window.addMessage=(text,incoming=true)=>{
 const id=String(++counter),row=document.createElement('div'),outer=document.createElement('div'),body=document.createElement('div');
 if(platform==='splus'){row.id='message'+id;row.dataset.messageId=id;row.style.display='flex';row.style.flexDirection=incoming?'row':'row-reverse';outer.style.width='fit-content';body.dataset.ignoreOnPaste='false'}
 else{const group=document.createElement('div'),bubble=document.createElement('div');group.dataset.msgId=id;bubble.style.display='flex';bubble.style.flexDirection=incoming?'row':'row-reverse';bubble.append(row);group.append(bubble);document.getElementById('messages').append(group);row.setAttribute('rb-message-item','');body.setAttribute('rb-message-text','')}
 body.dir='auto';const textNode=document.createElement('div');textNode.textContent=text;body.append(textNode);
 const time=document.createElement('span');time.textContent='12:34';if(platform==='splus')time.dataset.ignoreOnPaste='true';else time.setAttribute('rb-message-time','');body.append(time);outer.append(body);row.append(outer);
 if(platform==='splus')document.getElementById('messages').append(row);return id;
};
window.addAttachment=(bytes,name,incoming=true)=>{
 const id=addMessage('',incoming),row=platform==='splus'?document.getElementById('message'+id):document.querySelector('[data-msg-id="'+id+'"] [rb-message-item]');
 const body=row.firstElementChild.firstElementChild;body.replaceChildren();const doc=document.createElement('div'),icon=document.createElement('div'),info=document.createElement('div'),title=document.createElement('div');title.dir='auto';title.textContent=name+'.cgpe';info.append(title);doc.append(icon,info);body.append(doc);
 function download(){const blob=new Blob([typeof bytes==='string'?Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)):new Uint8Array(bytes)]),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.cgpe';a.click()}
 icon.onclick=download;if(platform==='rubika')info.onclick=download;
 return id;
};
'''
    return '<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}#messages{height:400px;overflow:auto}[contenteditable]{min-height:40px}[text-editor],#native-compose-bubble{width:calc(100% - 65px);box-sizing:border-box}body{margin:8px}</style></head><body>'+body+'<script>'+script.replace('PLATFORM',json.dumps(platform))+'</script></body></html>'
