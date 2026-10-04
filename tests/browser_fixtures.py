"""Small real media fixtures and native-attachment DOM shared by browser checks."""
import io, wave, math, struct, tempfile, subprocess
from pathlib import Path

ATTACHMENT_JS = '''const [encoded,name]=arguments[0];const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));const blob=new Blob([bytes]);const row=document.createElement('div');row.dataset.sid='media:'+crypto.randomUUID();row.dataset.date=String(Date.now());row.setAttribute('aria-label','message-item');row.innerHTML='<svg aria-label="LeftBubble-icon"></svg><div><a><div><div><img alt="file"></div></div><div><p></p><p>test media</p></div></a></div>';row.querySelector('a p').textContent=name+'.cgpe';row.querySelector('a p').onclick=()=>{const a=document.createElement('a');a.download=name+'.cgpe';a.href=URL.createObjectURL(blob);document.body.append(a);a.click();a.remove();};document.getElementById('message_list_scroller_id').append(row);return row.dataset.sid;'''
ENCRYPT_JS = '''const [bytes,name,type,key]=arguments[0];const file=await CipherGapShared.file_crypto.encrypt_file(new File([Uint8Array.from(bytes)],name,{type}),key);return btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));'''
def media_fixtures(root):
    wav=io.BytesIO()
    with wave.open(wav,'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(8000)
        out.writeframes(b''.join(struct.pack('<h',int(1800*math.sin(i*2*math.pi*440/8000))) for i in range(8000)))
    with tempfile.TemporaryDirectory(prefix='ciphergap-media-') as folder:
        video=Path(folder)/'clip.webm'
        subprocess.run(['ffmpeg','-loglevel','error','-f','lavfi','-i','color=c=blue:s=64x64:d=1','-c:v','libvpx','-y',str(video)],check=True)
        return [( 'picture.png','image/png',(root/'CipherGap/assets/icon128.png').read_bytes(),'img'),('sound.wav','audio/vnd.wave',wav.getvalue(),'audio'),('clip.webm','video/webm',video.read_bytes(),'video'),('document.html','text/html',b'<script>window.unsafePreview=true</script>','fallback')]
