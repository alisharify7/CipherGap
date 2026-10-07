package com.ciphergap.mobile;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

public class MainActivity extends Activity {
    static final String LOCAL = "https://appassets.androidplatform.net";
    static final Set<String> ORIGINS = new HashSet<>(Arrays.asList("https://web.bale.ai", "https://web.eitaa.com", "https://web.telegram.org"));
    static final int PICK_FILE = 10, SAVE_FILE = 11, NOTIFICATIONS = 12, QR_CAMERA = 13;
    static final long MAX_BYTES = 101L * 1024 * 1024;
    WebView shell, chat, security;
    JavaScriptReplyProxy chatProxy;
    final Map<WebView, JavaScriptReplyProxy> peers = new HashMap<>();
    final Map<String, PendingAction> actions = new HashMap<>();
    final Map<String, Transfer> downloads = new HashMap<>();
    final Handler handler = new Handler(Looper.getMainLooper());
    final Set<String> notified = new HashSet<>();
    FrameLayout content;
    LinearLayout root, bar;
    SecureStore store;
    JSONObject data;
    WebViewAssetLoader assets;
    ValueCallback<Uri[]> fileCallback;
    Transfer saving;
    boolean compatible, started;
    String settingsRequest;
    String shellPage="home";
    JavaScriptReplyProxy settingsProxy;
    PermissionRequest cameraRequest;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try { store = new SecureStore(this); data = store.read(); }
        catch (Exception e) { new AlertDialog.Builder(this).setMessage("CipherGap could not open its protected settings. No data has been overwritten.").setPositiveButton("Close", (d,w)->finish()).setCancelable(false).show(); return; }
        if (!data.has("ciphergap_ui_language")) {
            try { data.put("ciphergap_ui_language", Locale.getDefault().getLanguage().equals("fa") ? "fa" : "en"); store.write(data); }
            catch (Exception e) { finish(); return; }
        }
        assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            new AlertDialog.Builder(this).setMessage(tr("Update Android System WebView, then reopen CipherGap.","Android System WebView را به‌روزرسانی کنید و برنامه را دوباره باز کنید.")).setPositiveButton(tr("Close","بستن"),(d,w)->finish()).show();return;
        }
        if (Build.VERSION.SDK_INT>=33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
        File[] oldFiles=getCacheDir().listFiles((dir,name)->name.startsWith("cg-download-"));if(oldFiles!=null)for(File f:oldFiles)f.delete();
        compatible = WebViewFeature.isFeatureSupported(WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setOnApplyWindowInsetsListener((v,insets)->{ v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets.consumeSystemWindowInsets(); });
        content = new FrameLayout(this); root.addView(content, new LinearLayout.LayoutParams(-1,0,1));
        bar = new LinearLayout(this); bar.setPadding(8,4,8,4);
        for (String id : Arrays.asList("home", "security", "settings")) {
            Button b = new Button(this); b.setTag(id); b.setAllCaps(false);
            b.setOnClickListener(v -> { if (id.equals("home")) showShell("home"); else if (id.equals("settings")) showShell("settings"); else showSecurity(); });
            bar.addView(b,new LinearLayout.LayoutParams(0,dp(60),1));
        }
        root.addView(bar); bar.setVisibility(View.GONE); setContentView(root); updateTheme();
        shell = createWebView(true); content.addView(shell,new FrameLayout.LayoutParams(-1,-1));
        shell.loadUrl(LOCAL + "/assets/index.html");
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("ciphergap_messages", "CipherGap", NotificationManager.IMPORTANCE_DEFAULT));
        handleNotification(getIntent());
    }
    int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    boolean fa() { return data.optString("ciphergap_ui_language").equals("fa"); }
    String tr(String en, String persian) { return fa() ? persian : en; }
    void updateTheme() {
        boolean dark = data.optString("ciphergap_ui_theme").equals("dark");
        int background = Color.parseColor(dark ? "#18191b" : "#ffffff");
        root.setBackgroundColor(background); bar.setBackgroundColor(background);
        String[] en={"Home","Chat security","Settings"}, persian={"خانه","امنیت گفتگو","تنظیمات"};
        int[] icons={R.drawable.ic_home,R.drawable.ic_security,R.drawable.ic_settings};
        int foreground=Color.parseColor(dark?"#9eb1ff":"#3e63dd");
        for (int i=0;i<bar.getChildCount();i++) {
            Button b=(Button)bar.getChildAt(i);String label=fa()?persian[i]:en[i];
            b.setText(label);b.setTextSize(10);b.setContentDescription(label);b.setTooltipText(label);
            b.setElevation(0);b.setStateListAnimator(null);b.setPadding(dp(6),dp(5),dp(6),dp(5));
            android.graphics.drawable.Drawable icon=getDrawable(icons[i]);icon.setTint(foreground);
            b.setCompoundDrawablesWithIntrinsicBounds(null,icon,null,null);b.setCompoundDrawablePadding(dp(3));
            android.graphics.drawable.GradientDrawable shape=new android.graphics.drawable.GradientDrawable();
            shape.setColor(background);shape.setCornerRadius(dp(16));
            b.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(Color.parseColor(dark?"#293657":"#edf2fe")),shape,null));
            b.setTextColor(foreground);
        }
        bar.setLayoutDirection(fa()?View.LAYOUT_DIRECTION_RTL:View.LAYOUT_DIRECTION_LTR);
        getWindow().setStatusBarColor(background); getWindow().setNavigationBarColor(background);
        if(Build.VERSION.SDK_INT>=30 && getWindow().getInsetsController()!=null) {
            int light=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(dark?0:light,light);
        } else getWindow().getDecorView().setSystemUiVisibility(dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    }
    static void copy(InputStream in, OutputStream out) throws IOException {byte[] buffer=new byte[32768];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);}
    static byte[] readAll(InputStream in) throws IOException {ByteArrayOutputStream out=new ByteArrayOutputStream();copy(in,out);return out.toByteArray();}
    String asset(String name) throws IOException { try (InputStream in=getAssets().open(name)) { return new String(readAll(in),StandardCharsets.UTF_8); } }
    // Messenger websites require JavaScript; native privileges remain origin/world scoped.
    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    WebView createWebView(boolean local) {
        WebView view=new WebView(this); WebSettings s=view.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(false); s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); s.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(view,false);
        view.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                WebResourceResponse own=assets.shouldInterceptRequest(request.getUrl()); if (own!=null) return own;
                return null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri=request.getUrl();
                if (local && uri.toString().startsWith(LOCAL+"/assets/")) return false;
                if (!local && messengerUrl(uri.toString())) return false;
                if ("https".equals(uri.getScheme())) openExternal(uri);
                return true;
            }
            @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon) { peers.remove(v); if(v==chat) chatProxy=null; }
            @Override public void onReceivedSslError(WebView v,android.webkit.SslErrorHandler h,android.net.http.SslError error) { h.cancel(); }
            @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail) {
                peers.remove(v); content.removeView(v);v.destroy();if(v==chat){chat=null;chatProxy=null;} if(v==security)security=null;
                if(v==shell){shell=createWebView(true);content.addView(shell);shell.loadUrl(LOCAL+"/assets/index.html");}
                showShell("home"); Toast.makeText(MainActivity.this,tr("The browser stopped. Open the messenger again.","مرورگر متوقف شد. پیام‌رسان را دوباره باز کنید."),Toast.LENGTH_LONG).show(); return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params) {
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                try{startActivityForResult(intent,PICK_FILE);}catch(ActivityNotFoundException e){callback.onReceiveValue(null);fileCallback=null;}return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                // Only the trusted key scanner can use video. Messenger pages
                // and audio requests remain denied even after camera approval.
                if (!local || view!=security || !LOCAL.equals(request.getOrigin().toString().replaceAll("/$","")) || request.getResources().length!=1 || !PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(request.getResources()[0])) {request.deny();return;}
                if (cameraRequest!=null) cameraRequest.deny();
                if (checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED) request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                else {cameraRequest=request;requestPermissions(new String[]{Manifest.permission.CAMERA},QR_CAMERA);}
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {if(cameraRequest==request)cameraRequest=null;}
        });
        view.setDownloadListener((url,ua,disposition,mime,length)->Toast.makeText(this,tr("Use the CipherGap Download button for decrypted files.","برای فایل رمزگشایی‌شده از دکمهٔ دانلود CipherGap استفاده کنید."),Toast.LENGTH_LONG).show());
        if (local && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(view,"cgNative",Collections.singleton(LOCAL),(v,msg,origin,main,reply)->{ if(main && LOCAL.equals(origin.toString())) receive(v,msg,reply,true,origin); });
        } else if (!local && WebViewFeature.isFeatureSupported(WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD)) {
            JavaScriptExecutionWorld world=WebViewCompat.getExecutionWorld(view,"ciphergap");
            WebViewCompat.addWebMessageListener(view,"cgNative",ORIGINS,world,(v,msg,origin,main,reply)->{ if(main && ORIGINS.contains(origin.toString()) && messengerUrl(v.getUrl())) receive(v,msg,reply,false,origin); });
            try {
                WebViewCompat.addJavaScriptOnEvent(view,asset("page.js"),WebViewCompat.INJECTION_EVENT_DOCUMENT_START,ORIGINS,WebViewCompat.getExecutionWorld(view,JavaScriptExecutionWorld.PAGE_WORLD_NAME));
                // Shared UI observers require documentElement/body, just as the
                // extension's default document_idle scripts do.
                WebViewCompat.addJavaScriptOnEvent(view,asset("content.js"),WebViewCompat.INJECTION_EVENT_DOCUMENT_END,ORIGINS,world);
            } catch(IOException e) { throw new IllegalStateException("Bundled core unavailable",e); }
        }
        return view;
    }
    static boolean messengerUrl(String url) {
        if(url==null)return false;Uri u=Uri.parse(url);
        if(!"https".equals(u.getScheme()) || u.getUserInfo()!=null || (u.getPort()!=-1&&u.getPort()!=443))return false;
        return "web.bale.ai".equals(u.getHost()) || "web.eitaa.com".equals(u.getHost()) || "web.telegram.org".equals(u.getHost()) && u.getPath()!=null && u.getPath().startsWith("/a/");
    }
    void openExternal(Uri uri) { try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(ActivityNotFoundException e){Toast.makeText(this,tr("No browser is available.","مرورگری در دسترس نیست."),Toast.LENGTH_SHORT).show();} }
    void showShell(String page) {closeKeyScanner();bar.setVisibility(View.GONE);shell.setVisibility(View.VISIBLE);if(chat!=null)chat.setVisibility(View.GONE);if(security!=null)security.setVisibility(View.GONE);shell.evaluateJavascript("window.navigate && navigate("+JSONObject.quote(page)+")",null); }
    void openMessenger(String url) {
        if(!messengerUrl(url))throw new IllegalArgumentException("Unsupported messenger address.");
        if(!compatible){showShell("home");Toast.makeText(this,tr("Update Android System WebView to use encryption.","برای رمزنگاری، Android System WebView را به‌روزرسانی کنید."),Toast.LENGTH_LONG).show();return;}
        if(chat==null){chat=createWebView(false);content.addView(chat,new FrameLayout.LayoutParams(-1,-1));}
        if(!url.equals(chat.getUrl()))chat.loadUrl(url);
        bar.setVisibility(View.VISIBLE);shell.setVisibility(View.GONE);if(security!=null)security.setVisibility(View.GONE);chat.setVisibility(View.VISIBLE);
    }
    void showSecurity() {
        if(chat==null || chatProxy==null){showShell("home");Toast.makeText(this,tr("Open a messenger first.","ابتدا یک پیام‌رسان را باز کنید."),Toast.LENGTH_SHORT).show();return;}
        if(security==null){security=createWebView(true);content.addView(security,new FrameLayout.LayoutParams(-1,-1));}
        // Keep the live messenger sized and running behind the security sheet.
        // Native send/input handlers must remain available during key exchange.
        bar.setVisibility(View.VISIBLE);shell.setVisibility(View.GONE);chat.setVisibility(View.VISIBLE);security.setVisibility(View.VISIBLE);security.bringToFront();security.loadUrl(LOCAL+"/assets/extension/popup/popup.html");
    }
    void receive(WebView view,WebMessageCompat message,JavaScriptReplyProxy reply,boolean local,Uri origin) {
        String id="";
        try {
            String raw=message.getData();if(raw==null || raw.length()>1000000)throw new IllegalArgumentException("Invalid host request.");
            JSONObject request=new JSONObject(raw);id=request.getString("id");String op=request.getString("op");Object result=JSONObject.NULL;
            peers.put(view,reply);
            switch(op) {
                case "ready": if(view==chat)chatProxy=reply;result=new JSONObject().put("compatible",compatible);break;
                case "get": result=readKeys(request.opt("keys"),local,origin);break;
                case "set": case "remove": result=changeKeys(op,request,local,origin);updateTheme();break;
                case "action": requireLocal(local);routeAction(reply,id,request.getJSONObject("message"));return;
                case "action_result":
                    if(view!=chat)throw new SecurityException("Invalid action source.");
                    PendingAction action=actions.remove(request.getString("token"));if(action!=null)response(action.proxy,action.id,request.opt("result"),null);break;
                case "tabs": requireLocal(local);result=chat==null?JSONObject.NULL:new JSONObject().put("id",1).put("url",chat.getUrl());break;
                case "open_security": showSecurity();break;
                case "app_state": requireLocal(local);result=new JSONObject().put("compatible",compatible).put("version",BuildConfig.VERSION_NAME).put("debug",BuildConfig.DEBUG).put("notificationsAllowed",notificationAllowed()).put("chatUrl",chat==null?JSONObject.NULL:chat.getUrl());break;
                case "navigate_state":requireLocal(local);String page=request.getString("page");if(!Arrays.asList("home","guide","settings").contains(page))throw new IllegalArgumentException();shellPage=page;break;
                case "open_messenger":requireLocal(local);openMessenger(request.getString("url"));break;
                case "resume":requireLocal(local);if(chat!=null){bar.setVisibility(View.VISIBLE);shell.setVisibility(View.GONE);if(security!=null)security.setVisibility(View.GONE);chat.setVisibility(View.VISIBLE);}break;
                case "external":requireLocal(local);Uri uri=Uri.parse(request.getString("url"));if(!"https".equals(uri.getScheme()))throw new SecurityException("HTTPS required.");openExternal(uri);break;
                case "notifications":
                    requireLocal(local);
                    if(request.getBoolean("enabled") && Build.VERSION.SDK_INT>=33 && !notificationAllowed()){
                        settingsRequest=id;settingsProxy=reply;requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATIONS);return;
                    }
                    data.put("android_notifications",request.getBoolean("enabled"));store.write(data);result=notificationAllowed();break;
                case "clear_browser":requireLocal(local);confirmClear(reply,id);return;
                case "notify":if(view!=chat)throw new SecurityException("Invalid notification source.");notifyMessage(request.getJSONObject("event"),origin);break;
                case "download_begin":result=beginDownload(request,view);break;
                case "download_chunk":writeChunk(request,view);break;
                case "download_finish":finishDownload(request,view);break;
                case "download_cancel":cancelDownload(request.getString("transfer"),view);break;
                default:throw new IllegalArgumentException("Unknown host action.");
            }
            response(reply,id,result,null);
        } catch(Exception e) { response(reply,id,null,tr("The operation could not be completed. Reopen the page and try again.","عملیات انجام نشد. صفحه را دوباره باز کنید و تلاش کنید.")); }
    }
    void requireLocal(boolean local){if(!local)throw new SecurityException("Trusted app UI required.");}
    boolean keyAllowed(String key,boolean local,Uri origin) {
        if(local)return true;
        if(key.startsWith("ciphergap_ui_") || key.equals("ciphergap_enabled") || key.equals("cg_handled_nonces"))return true;
        return key.contains(origin.getHost()+"_") && !key.contains("/") && key.length()<256;
    }
    JSONObject readKeys(Object keys,boolean local,Uri origin)throws Exception {
        JSONObject result=new JSONObject();JSONArray names;
        if(keys==null || keys==JSONObject.NULL){names=data.names();}
        else if(keys instanceof JSONArray){names=(JSONArray)keys;}
        else if(keys instanceof JSONObject){names=((JSONObject)keys).names();}
        else{names=new JSONArray().put(keys);}
        if(names!=null)for(int i=0;i<names.length();i++){String key=names.getString(i);if(keyAllowed(key,local,origin)){if(data.has(key))result.put(key,data.get(key));else if(keys instanceof JSONObject)result.put(key,((JSONObject)keys).get(key));}}
        return result;
    }
    JSONObject changeKeys(String op,JSONObject request,boolean local,Uri origin)throws Exception {
        JSONObject update=op.equals("set")?request.getJSONObject("values"):new JSONObject();Object removed=request.opt("keys");
        JSONArray names=op.equals("set")?update.names():removed instanceof JSONArray?(JSONArray)removed:new JSONArray().put(removed);
        JSONObject diff=new JSONObject(),next=new JSONObject(data.toString());
        if(names!=null)for(int i=0;i<names.length();i++){
            String key=names.getString(i);if(!keyAllowed(key,local,origin))throw new SecurityException("Storage scope denied.");
            JSONObject delta=new JSONObject();if(data.has(key))delta.put("oldValue",data.get(key));
            if(op.equals("set")){next.put(key,update.get(key));delta.put("newValue",update.get(key));}else next.remove(key);
            diff.put(key,delta);
        }
        if(next.toString().length()>2000000)throw new IllegalArgumentException("Settings limit exceeded.");
        store.write(next);data=next;
        for(Map.Entry<WebView,JavaScriptReplyProxy> entry:new ArrayList<>(peers.entrySet())){
            Uri target=Uri.parse(entry.getKey().getUrl());boolean own=LOCAL.equals(target.getScheme()+"://"+target.getHost());JSONObject filtered=new JSONObject();
            for(Iterator<String> it=diff.keys();it.hasNext();){String key=it.next();if(keyAllowed(key,own,target))filtered.put(key,diff.get(key));}
            if(filtered.length()>0 && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))entry.getValue().postMessage(new JSONObject().put("type","changes").put("changes",filtered).toString());
        }
        return new JSONObject();
    }
    void response(JavaScriptReplyProxy proxy,String id,Object result,String error){if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))return;try{JSONObject r=new JSONObject().put("type","response").put("id",id);if(error!=null)r.put("error",error);else r.put("result",result==null?JSONObject.NULL:result);proxy.postMessage(r.toString());}catch(Exception ignored){}}
    void routeAction(JavaScriptReplyProxy reply,String id,JSONObject message)throws Exception {
        if(chatProxy==null)throw new IllegalStateException("No active chat.");
        if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            String token=UUID.randomUUID().toString();actions.put(token,new PendingAction(reply,id));
            chatProxy.postMessage(new JSONObject().put("type","runtime").put("token",token).put("message",message).toString());
            handler.postDelayed(()->{PendingAction timed=actions.remove(token);if(timed!=null)response(timed.proxy,timed.id,null,"The chat did not respond. Reopen it and try again.");},45000);
        } else throw new IllegalStateException("Update WebView.");
    }
    boolean notificationAllowed(){return getSystemService(NotificationManager.class).areNotificationsEnabled() && (Build.VERSION.SDK_INT<33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED);}
    void notifyMessage(JSONObject event,Uri origin)throws Exception {
        if(!started || !data.optBoolean("android_notifications") || !notificationAllowed() || data.optBoolean("ciphergap_enabled",true)==false)return;
        String url=event.getString("url"),key=event.getString("storageKey"),id=event.getString("id");
        if(!messengerUrl(url)||!origin.getHost().equals(Uri.parse(url).getHost())||!key.contains(origin.getHost()+"_")||!data.optBoolean(key+"__enabled",true))return;
        String unique=key+":"+id;if(!notified.add(unique))return;
        if(notified.size()>5000){notified.clear();notified.add(unique);}
        Intent intent=new Intent(this,MainActivity.class).putExtra("chat_url",url).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending=PendingIntent.getActivity(this,unique.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String text=event.optBoolean("exchange")?tr("New key exchange request", "درخواست جدید تبادل کلید"):tr("New message in your open messenger", "پیام جدید در پیام‌رسان بازشده");
        getSystemService(NotificationManager.class).notify(unique.hashCode(),new Notification.Builder(this,"ciphergap_messages").setSmallIcon(android.R.drawable.ic_lock_lock).setContentTitle("CipherGap").setContentText(text).setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(pending).setAutoCancel(true).build());
    }
    void confirmClear(JavaScriptReplyProxy reply,String id){new AlertDialog.Builder(this).setTitle(tr("Clear browser data?","داده‌های مرورگر پاک شود؟")).setMessage(tr("This signs out all messengers and removes saved keys and settings. It cannot be undone.","از تمام پیام‌رسان‌ها خارج می‌شوید و کلیدها و تنظیمات ذخیره‌شده حذف می‌شوند. این کار قابل بازگشت نیست.")).setNegativeButton(tr("Cancel","انصراف"),(d,w)->response(reply,id,false,null)).setPositiveButton(tr("Clear data","پاک کردن"),(d,w)->{
        try{store.write(new JSONObject());data=new JSONObject();notified.clear();getSystemService(NotificationManager.class).cancelAll();for(Transfer t:downloads.values())t.dispose();downloads.clear();if(chat!=null){peers.remove(chat);chat.stopLoading();content.removeView(chat);chat.destroy();chat=null;chatProxy=null;}if(security!=null){peers.remove(security);content.removeView(security);security.destroy();security=null;}actions.clear();
            WebStorage.getInstance().deleteAllData();shell.clearCache(true);CookieManager.getInstance().removeAllCookies(ok->{CookieManager.getInstance().flush();response(reply,id,true,null);shell.loadUrl(LOCAL+"/assets/index.html");});
        }catch(Exception e){response(reply,id,null,"Could not clear data.");}
    }).setOnCancelListener(d->response(reply,id,false,null)).show();}
    String beginDownload(JSONObject request,WebView owner)throws Exception {
        if(downloads.size()>=2 || saving!=null)throw new IllegalStateException("Finish the current download first.");
        long size=request.getLong("size");if(size<0||size>MAX_BYTES)throw new IllegalArgumentException("File limit exceeded.");
        String id=UUID.randomUUID().toString(),name=request.getString("name").replaceAll("[\\\\/\\p{Cntrl}]","_");if(name.trim().isEmpty()||name.length()>255)name="decrypted-file";
        Transfer t=new Transfer(new File(getCacheDir(),"cg-download-"+id),name,request.optString("mime","application/octet-stream"),size,owner);downloads.put(id,t);
        handler.postDelayed(()->{Transfer expired=downloads.remove(id);if(expired!=null && expired!=saving)expired.dispose();},120000);return id;
    }
    Transfer transfer(JSONObject request,WebView owner)throws Exception {Transfer t=downloads.get(request.getString("transfer"));if(t==null||t.owner!=owner)throw new SecurityException("Invalid transfer.");return t;}
    void writeChunk(JSONObject request,WebView owner)throws Exception {Transfer t=transfer(request,owner);if(t.closed)throw new IllegalStateException("Transfer finished.");String chunk=request.getString("data");if(chunk.length()>65536)throw new IllegalArgumentException("Chunk limit.");byte[] bytes=Base64.decode(chunk,Base64.NO_WRAP);if(t.written+bytes.length>t.size)throw new IllegalArgumentException("File limit.");t.out.write(bytes);t.written+=bytes.length;}
    void finishDownload(JSONObject request,WebView owner)throws Exception {Transfer t=transfer(request,owner);if(t.written!=t.size||saving!=null)throw new IllegalStateException("Incomplete transfer.");t.out.close();t.closed=true;saving=t;Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(t.mime.trim().isEmpty()?"application/octet-stream":t.mime).putExtra(Intent.EXTRA_TITLE,t.name);try{startActivityForResult(intent,SAVE_FILE);}catch(Exception e){saving=null;cancelDownload(request.getString("transfer"),owner);throw e;}}
    void cancelDownload(String id,WebView owner){Transfer t=downloads.get(id);if(t!=null&&t.owner==owner){downloads.remove(id);t.dispose();}}
    @Override protected void onActivityResult(int request,int result,Intent intent){super.onActivityResult(request,result,intent);
        if(request==PICK_FILE && fileCallback!=null){ArrayList<Uri> files=new ArrayList<>();if(result==RESULT_OK&&intent!=null){if(intent.getClipData()!=null){for(int i=0;i<intent.getClipData().getItemCount();i++)files.add(intent.getClipData().getItemAt(i).getUri());}else if(intent.getData()!=null)files.add(intent.getData());}fileCallback.onReceiveValue(files.isEmpty()?null:files.toArray(new Uri[0]));fileCallback=null;}
        if(request==SAVE_FILE && saving!=null){Transfer t=saving;saving=null;downloads.values().remove(t);new Thread(()->{try{if(result==RESULT_OK&&intent!=null&&intent.getData()!=null){try(InputStream in=new FileInputStream(t.file);OutputStream out=getContentResolver().openOutputStream(intent.getData())){if(out==null)throw new IOException();copy(in,out);}runOnUiThread(()->Toast.makeText(this,tr("File saved","فایل ذخیره شد"),Toast.LENGTH_SHORT).show());}}catch(Exception e){runOnUiThread(()->Toast.makeText(this,tr("Could not save the file. Try Download again.","فایل ذخیره نشد. دوباره دانلود را بزنید."),Toast.LENGTH_LONG).show());}finally{t.dispose();}}).start();}
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code==QR_CAMERA&&cameraRequest!=null){PermissionRequest request=cameraRequest;cameraRequest=null;if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED&&security!=null&&security.getVisibility()==View.VISIBLE&&security.getUrl()!=null&&security.getUrl().startsWith(LOCAL+"/assets/extension/popup/"))request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else request.deny();}if(code==NOTIFICATIONS&&settingsProxy!=null){try{data.put("android_notifications",notificationAllowed());store.write(data);response(settingsProxy,settingsRequest,notificationAllowed(),null);}catch(Exception e){response(settingsProxy,settingsRequest,null,"Could not save notification settings.");}settingsProxy=null;}}
    void handleNotification(Intent intent){String url=intent.getStringExtra("chat_url");if(url!=null&&messengerUrl(url))openMessenger(url);}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleNotification(intent);}
    @Override protected void onStart(){super.onStart();started=true;}
    @Override protected void onStop(){started=false;closeKeyScanner();super.onStop();}
    void closeKeyScanner(){if(cameraRequest!=null){cameraRequest.deny();cameraRequest=null;}if(security!=null)security.evaluateJavascript("for(const id of ['scannerDialog','qrDialog']){const d=document.getElementById(id);if(d?.open)d.close();}",null);}
    // The system camera permission dialog pauses the Activity. Keep its request
    // alive until the result; onStop still releases it when the app is hidden.
    @Override protected void onPause(){super.onPause();if(cameraRequest==null)closeKeyScanner();CookieManager.getInstance().flush();}
    // API 33+ uses the platform OnBackInvokedDispatcher registered above; older
    // devices retain their Activity callback. No AndroidX Activity dependency needed.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed(){handleBack();}
    void handleBack(){closeKeyScanner();if(security!=null&&security.getVisibility()==View.VISIBLE){if(chat!=null){security.setVisibility(View.GONE);chat.setVisibility(View.VISIBLE);}else showShell("home");}else if(chat!=null&&chat.getVisibility()==View.VISIBLE){if(chat.canGoBack())chat.goBack();else showShell("home");}else if(!shellPage.equals("home"))showShell("home");else finish();}
    @Override protected void onDestroy(){for(Transfer t:downloads.values())t.dispose();if(fileCallback!=null)fileCallback.onReceiveValue(null);if(shell!=null)shell.destroy();if(chat!=null)chat.destroy();if(security!=null)security.destroy();handler.removeCallbacksAndMessages(null);super.onDestroy();}
    static final class PendingAction{final JavaScriptReplyProxy proxy;final String id;PendingAction(JavaScriptReplyProxy p,String i){proxy=p;id=i;}}
    static final class Transfer{final File file;final String name,mime;final long size;final WebView owner;final FileOutputStream out;long written;boolean closed;Transfer(File f,String n,String m,long s,WebView o)throws IOException{file=f;name=n;mime=m;size=s;owner=o;out=new FileOutputStream(f);}void dispose(){try{out.close();}catch(IOException ignored){}file.delete();}}
}
