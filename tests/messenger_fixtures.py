"""Sanitized native DOM contracts captured from Eitaa and Telegram Web A.
The messenger's own upload/send handlers deliberately receive only DOM events.
"""
import json

SCRIPT = r'''
window.testSent=[];window.received=[];let counter=100;const platform=PLATFORM;
const editor=document.querySelector('[contenteditable=true]');
function nativeSend(){testSent.push(editor.innerText);editor.textContent='';editor.dispatchEvent(new Event('input',{bubbles:true}));}
window.nativeFile=document.createElement('input');nativeFile.type='file';nativeFile.multiple=true;
nativeFile.onchange=async()=>{for(const file of nativeFile.files)received.push({name:file.name,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))});};
if(platform==='telegram'){
 document.querySelector('[role=menuitem]').onclick=()=>nativeFile.click();
 const send=document.getElementById('native-send');send.onclick=nativeSend;
 editor.addEventListener('input',()=>send.setAttribute('aria-label',editor.innerText.trim()?'Send Message':'Record voice message'));
}else{
 const slot=document.getElementById('file-slot');setTimeout(()=>slot.replaceWith(nativeFile),200);
 const attach=document.querySelector('[data-icon=attach]').parentElement;
 attach.onclick=()=>{if(!attach.querySelector('[data-icon=document]'))setTimeout(()=>{const item=document.createElement('div'),icon=document.createElement('span');icon.dataset.icon='document';item.append(icon);item.addEventListener('click',e=>{e.stopPropagation();nativeFile.click()});attach.append(item)},50)};
 document.querySelector('[data-icon=send]').parentElement.onclick=nativeSend;
}
window.addMessage=(text,incoming=true)=>{
 const row=document.createElement('div');const id=String(++counter);
 if(platform==='telegram'){row.id='message-'+id;row.dataset.messageId=id;row.style.display='flex';row.style.flexDirection=incoming?'row':'row-reverse';}
 else{row.dataset.mid=id;row.dataset.peerId=location.hash.slice(1);row.dataset.timestamp=String(Math.floor(Date.now()/1000));row.style.display='flex';row.style.flexDirection=incoming?'row':'row-reverse';}
 const outer=document.createElement('div'),body=document.createElement('div');outer.append(body);row.append(outer);
 body.dir='auto';body.append(document.createTextNode(text));
 if(platform==='telegram'){body.style.contain='inline-size';outer.style.width='fit-content';outer.style.maxWidth='480px';outer.style.padding='8px';}
 const meta=document.createElement('span');if(platform==='telegram')meta.dataset.ignoreOnPaste='true';else{const tooltip=document.createElement('div');tooltip.title=new Date().toUTCString();meta.append(tooltip);}meta.append('12:34');body.append(meta);
 document.getElementById('messages').append(row);return id;
};
window.addAttachment=(bytes,name,incoming=true)=>{
 const id=addMessage('',incoming),row=platform==='telegram'?document.getElementById('message-'+id):document.querySelector('[data-mid="'+id+'"]');
 const body=row.firstElementChild.firstElementChild;body.replaceChildren();
 const doc=document.createElement('div');if(platform==='eitaa'){doc.dataset.docId=id;doc.style.height='72px';doc.style.overflow='hidden';}
 const icon=document.createElement('div'),info=document.createElement('div'),title=document.createElement('div');title.dir='auto';title.textContent=name+'.cgpe';info.append(title);doc.append(icon,info);body.append(doc);
 icon.onclick=e=>{e.stopPropagation();const blob=new Blob([(typeof bytes==='string'?Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)):new Uint8Array(bytes))]);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name+'.cgpe';a.click();};
 if(platform==='eitaa')doc.onclick=()=>icon.click();
 return id;
};
'''

def html(platform):
    if platform=='telegram':
        body='''<div id="MiddleColumn"><div id="messages"></div><div style="position:relative"><div><button id="attach-menu-button" type="button">Attach</button><div id="attach-menu-controls"><div role="menuitem">File</div></div><div id="message-input-text"><div><div><div id="editable-message-text" role="textbox" contenteditable="true"></div></div></div></div></div><button id="native-send" type="button" aria-label="Record voice message">Send</button></div></div>'''
    else:
        body='''<div id="column-center"><div id="messages"></div><div style="position:relative"><div><div><div data-offset="commands"><div><div contenteditable="true" enterkeyhint="enter"></div><span>Message</span><div contenteditable="true" hidden></div></div><div><span data-icon="attach"></span></div><div></div><span id="file-slot"></span></div></div></div><div><button type="button"><span data-icon="send"></span></button></div></div></div>'''
    return '<!doctype html><html><head><style>#messages{height:350px;overflow:auto}[contenteditable]{min-height:40px}button{padding:8px}</style></head><body>'+body+'<script>'+SCRIPT.replace('PLATFORM',json.dumps(platform))+'</script></body></html>'
