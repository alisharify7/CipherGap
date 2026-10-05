// Preserve shared DOM controls; only platform presentation differs on mobile.
(function () {
    function install() {
        if (!document.head || document.getElementById('ciphergap-mobile-style')) return;
        const style = document.createElement('style'); style.id = 'ciphergap-mobile-style';
        style.textContent = CIPHERGAP_STYLES + '\n' + CIPHERGAP_MOBILE_STYLES;
        document.head.append(style);
    }
    install();
    document.addEventListener('DOMContentLoaded', install, {once: true});
})();
