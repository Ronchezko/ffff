// ============================================================
// RESISTANCE CITY v5.0.0 — Admin Panel JavaScript
// ============================================================

'use strict';

(function() {
    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    document.addEventListener('DOMContentLoaded', function() {
        initConfirmButtons();
        initAutoRefresh();
        initMobileMenu();
        initFormValidation();
        initTabNavigation();
        console.log('Resistance Admin Panel v5.0.0 initialized');
    });

    // ==================== КНОПКИ С ПОДТВЕРЖДЕНИЕМ ====================
    function initConfirmButtons() {
        document.querySelectorAll('[data-confirm]').forEach(function(el) {
            el.addEventListener('click', function(e) {
                var message = this.getAttribute('data-confirm') || 'Вы уверены?';
                if (!confirm(message)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        });
    }

    // ==================== АВТООБНОВЛЕНИЕ ====================
    function initAutoRefresh() {
        var refreshElements = document.querySelectorAll('.auto-refresh');
        if (refreshElements.length === 0) return;

        setInterval(function() {
            fetch('/api/stats')
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    if (data.success && data.data) {
                        updateDashboardStats(data.data);
                    }
                })
                .catch(function(err) {
                    console.error('Auto-refresh error:', err);
                });
        }, 30000);
    }

    function updateDashboardStats(stats) {
        var mapping = {
            'stat-rp': stats.rpCount,
            'stat-clan': stats.clanCount,
            'stat-online': stats.onlineCount,
            'stat-jailed': stats.jailedCount,
            'stat-sick': stats.sickCount,
        };

        Object.keys(mapping).forEach(function(id) {
            var el = document.getElementById(id);
            if (el && mapping[id] !== undefined && mapping[id] !== null) {
                el.textContent = mapping[id];
            }
        });
    }

    // ==================== МОБИЛЬНОЕ МЕНЮ ====================
    function initMobileMenu() {
        var menuBtn = document.querySelector('.mobile-menu-btn');
        var navLinks = document.getElementById('navLinks');

        if (menuBtn && navLinks) {
            menuBtn.style.display = window.innerWidth <= 768 ? 'block' : 'none';

            window.addEventListener('resize', function() {
                menuBtn.style.display = window.innerWidth <= 768 ? 'block' : 'none';
                if (window.innerWidth > 768) {
                    navLinks.classList.remove('open');
                }
            });
        }
    }

    // ==================== ВАЛИДАЦИЯ ФОРМ ====================
    function initFormValidation() {
        document.querySelectorAll('form[data-validate]').forEach(function(form) {
            form.addEventListener('submit', function(e) {
                var isValid = true;
                var requiredFields = form.querySelectorAll('[required]');

                requiredFields.forEach(function(field) {
                    if (!field.value.trim()) {
                        isValid = false;
                        field.style.borderColor = 'var(--danger)';
                        field.classList.add('field-error');

                        field.addEventListener('input', function() {
                            field.style.borderColor = '';
                            field.classList.remove('field-error');
                        }, { once: true });
                    }
                });

                if (!isValid) {
                    e.preventDefault();
                    showToast('Заполните все обязательные поля', 'error');
                }
            });
        });
    }

    // ==================== НАВИГАЦИЯ ПО ВКЛАДКАМ ====================
    function initTabNavigation() {
        document.querySelectorAll('[data-tab-group]').forEach(function(group) {
            var groupName = group.getAttribute('data-tab-group');
            var tabs = group.querySelectorAll('[data-tab]');
            var panels = document.querySelectorAll('[data-tab-panel-group="' + groupName + '"] [data-tab-panel]');

            tabs.forEach(function(tab) {
                tab.addEventListener('click', function() {
                    var tabName = this.getAttribute('data-tab');

                    tabs.forEach(function(t) { t.classList.remove('active'); });
                    panels.forEach(function(p) { p.classList.remove('active'); });

                    this.classList.add('active');
                    var activePanel = document.querySelector('[data-tab-panel-group="' + groupName + '"] [data-tab-panel="' + tabName + '"]');
                    if (activePanel) activePanel.classList.add('active');
                });
            });
        });
    }

    // ==================== AJAX ФОРМЫ ====================
    document.addEventListener('submit', function(e) {
        var form = e.target.closest('form[data-ajax]');
        if (!form) return;

        e.preventDefault();
        var submitBtn = form.querySelector('[type="submit"]');
        var originalText = submitBtn ? submitBtn.textContent : '';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Отправка...';
        }

        var formData = new FormData(form);

        fetch(form.action, {
            method: form.method || 'POST',
            body: formData,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
            },
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                showToast(data.message || 'Успешно!', 'success');
                if (form.getAttribute('data-ajax-redirect')) {
                    window.location.href = form.getAttribute('data-ajax-redirect');
                }
                if (form.getAttribute('data-ajax-reset') !== 'false') {
                    form.reset();
                }
            } else {
                showToast(data.error || 'Ошибка', 'error');
            }
        })
        .catch(function(err) {
            showToast('Ошибка соединения: ' + err.message, 'error');
        })
        .finally(function() {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    });

    // ==================== TOAST УВЕДОМЛЕНИЯ ====================
    function showToast(message, type) {
        var container = document.querySelector('.admin-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'admin-toast-container';
            container.style.cssText = 'position: fixed; top: 80px; right: 24px; z-index: 10000; display: flex; flex-direction: column; gap: 8px;';
            document.body.appendChild(container);
        }

        var icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
        var colors = { success: '#76C519', warning: '#FFB800', error: '#CA4E4E', info: '#80C4C5' };

        var toast = document.createElement('div');
        toast.style.cssText = 'padding: 14px 20px; border-radius: 8px; background: var(--bg-card); border: 1px solid ' + (colors[type] || colors.info) + '; box-shadow: 0 8px 24px rgba(0,0,0,0.4); min-width: 280px; max-width: 400px; animation: slideInLeft 0.3s ease; display: flex; align-items: center; gap: 10px; font-size: 0.9rem;';
        toast.innerHTML = '<span>' + (icons[type] || '') + '</span> <span>' + message + '</span>';

        container.appendChild(toast);

        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3500);
    }

    // Экспорт
    window.showToast = showToast;

})();