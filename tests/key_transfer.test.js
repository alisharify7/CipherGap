const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const path = require("node:path");
const root = path.resolve(__dirname, "../CipherGap");
function core() {
    const context = vm.createContext({crypto:webcrypto, TextEncoder, TextDecoder, Uint8Array, btoa, atob});
    for (const name of ["namespace","config","encoding","key_transfer"]) vm.runInContext(fs.readFileSync(`${root}/share/${name}.js`,"utf8"),context);
    return context.CipherGapShared;
}
test("portable encrypted backups and QR preserve exact keys, validate imports and separate peer trust", async () => {
    const source = core(), destination = core(), t = source.key_transfer;
    const id = "web.eitaa.com_-601", second = "web.bale.ai_602", key = "کلید فارسی 👨‍👩‍👧‍👦 + / = 123";
    const username = "web.eitaa.com_@mralizohdi";
    const state = {
        [username]:"username chat key",
        [id]:key, [second]:"another key", [id+"__auto_decrypt"]:true, [id+"__auto_files"]:false,
        [id+"__enabled"]:false, ciphergap_enabled:false, ciphergap_ui_language:"fa", ciphergap_ui_theme:"dark",
        ["key_trust_"+id]:{state:"verified",source:"exchange",fingerprint:"1234abcd",at:123,verifiedAt:124},
        ["peer_fp_"+id]:{fingerprint:"1234abcd",at:123},
        ["exchange_status_"+id]:{status:"waiting",nonce:"transient"}, cg_handled_nonces:["transient"],
        [id+"__downloaded_files"]:["transient"], android_notifications:true
    };
    const full = t.snapshot(state);
    assert.equal(full.data[id],key);
    assert.equal(Object.keys(full.data).length,11);
    assert.equal(full.data["exchange_status_"+id],undefined);
    const text = await t.seal(full,"long secret password");
    assert.ok(!text.includes(key) && !text.includes(id));
    const restored = await destination.key_transfer.open(text,"long secret password");
    const plan = destination.key_transfer.plan_import(restored);
    assert.equal(plan.values[username],"username chat key");
    assert.equal(plan.values[id],key); assert.equal(plan.values["key_trust_"+id].state,"verified");
    assert.equal(plan.values.ciphergap_ui_language,"fa"); assert.equal(plan.values[id+"__enabled"],false);
    await assert.rejects(t.open(text,"different password"),/Wrong password/);
    const damaged = JSON.parse(text); damaged.data = damaged.data.slice(0,-8)+"AAAAAA==";
    await assert.rejects(t.open(JSON.stringify(damaged),"long secret password"),/damaged/);
    await assert.rejects(t.seal(full,"short"),/10 characters/);
    const invalid = {...full,data:{...full.data,evil:"value"}};
    assert.throws(()=>t.validate(invalid),/invalid settings/);
    assert.throws(()=>t.validate({...full,data:{[id+"__enabled"]:"false"}}),/invalid settings/);
    assert.throws(()=>t.validate({...full,data:JSON.parse('{"__proto__":{"polluted":true}}')}),/invalid settings/);
    const single = t.snapshot(state,id);
    assert.equal(single.data[second],undefined); assert.equal(single.data.ciphergap_enabled,undefined);
    const peer = destination.key_transfer.plan_import(await t.open(await t.seal(single,"long secret password"),"long secret password"),"web.eitaa.com_777");
    assert.equal(peer.values["web.eitaa.com_777"],key);
    assert.equal(peer.values["key_trust_web.eitaa.com_777"].state,"unverified");
    assert.equal(peer.values["peer_fp_web.eitaa.com_777"],undefined);
    assert.throws(()=>t.plan_import(full,"web.eitaa.com_777"),/single-chat/);
    const packet = t.share_key(key);
    assert.equal(destination.key_transfer.read_key(packet),key);
    assert.throws(()=>t.read_key("https://example.com/"),/not a CipherGap/);
    assert.throws(()=>t.read_key("ciphergap-key:2:YWJj"),/not a CipherGap/);
    assert.throws(()=>t.share_key("a".repeat(2000)),/too long for QR/);
    // Decode pixels with the actual offline decoder, rather than only testing strings.
    const qr = require(`${root}/share/vendor/qrcode.js`)(0,"M"); qr.addData(packet); qr.make();
    const cell=5, width=(qr.getModuleCount()+8)*cell, pixels=new Uint8ClampedArray(width*width*4);
    for (let y=0;y<width;y++) for(let x=0;x<width;x++) {
        const row=Math.floor(y/cell)-4,col=Math.floor(x/cell)-4;
        const dark=row>=0&&col>=0&&row<qr.getModuleCount()&&col<qr.getModuleCount()&&qr.isDark(row,col);
        pixels.set([dark?0:255,dark?0:255,dark?0:255,255],(y*width+x)*4);
    }
    assert.equal(require(`${root}/share/vendor/jsQR.js`)(pixels,width,width).data,packet);
});
