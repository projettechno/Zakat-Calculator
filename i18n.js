/* =============================================
   i18n — Internationalization System
   Loads language JSON, applies translations,
   handles RTL for Arabic
   ============================================= */

var i18n = {
  currentLang: 'fr',
  strings: {},
  ready: false,

  init: function () {
    var saved = localStorage.getItem('zakat_lang');
    if (saved === 'en' || saved === 'ar' || saved === 'fr') {
      this.currentLang = saved;
    }
    this.load();
  },

  load: function () {
    var self = this;
    fetch('lang/' + this.currentLang + '.json')
      .then(function (r) {
        if (!r.ok) throw new Error('Language not found');
        return r.json();
      })
      .then(function (data) {
        self.strings = data;
        self.ready = true;
        self.apply();
      })
      .catch(function () {
        // Fallback to French
        if (self.currentLang !== 'fr') {
          self.currentLang = 'fr';
          self.load();
        }
      });
  },

  apply: function () {
    var html = document.documentElement;

    // Set direction and language
    if (this.currentLang === 'ar') {
      html.setAttribute('dir', 'rtl');
      html.setAttribute('lang', 'ar');
    } else {
      html.setAttribute('dir', 'ltr');
      html.setAttribute('lang', this.currentLang);
    }

    // Translate text content
    var self = this;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (self.strings[key] !== undefined) {
        el.innerHTML = self.strings[key];
      }
    });

    // Translate placeholders
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-ph');
      if (self.strings[key] !== undefined) {
        el.setAttribute('placeholder', self.strings[key]);
      }
    });

    // Page title
    if (this.strings['meta.title']) {
      document.title = this.strings['meta.title'];
    }

    // Update language switcher active state
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.lang === i18n.currentLang);
    });

    // Re-render dashboard if visible (for dynamically generated text)
    if (typeof renderDashboard === 'function' && document.body.classList.contains('on-dashboard')) {
      renderDashboard();
    }
  },

  set: function (lang) {
    if (lang === this.currentLang) return;
    this.currentLang = lang;
    this.ready = false;
    localStorage.setItem('zakat_lang', lang);
    this.load();
  },

  t: function (key) {
    return this.strings[key] || key;
  }
};

// Global shorthand
function t(key) {
  return i18n.t(key);
}



// Initialize on load
i18n.init();
